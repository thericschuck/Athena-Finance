-- Rollback zu 20261030110000_tax_overrides_views.sql: Stand vom 2026-10-30 (Live-Definitionen per pg_get_viewdef).
-- Spalten/Typen beider Views sind identisch geblieben -> CREATE OR REPLACE genuegt, die abhaengige Kette bleibt stehen.
-- Danach lesen die Views wieder categories.tax_role/euer_zeile. ACHTUNG: Werte, die seitdem nur in category_tax_overrides
-- geaendert wurden, gehen fuer die Views verloren (die Legacy-Spalten sind eingefroren). Vorher ggf. zurueckkopieren:
--   update public.categories c set tax_role = o.tax_role, euer_zeile = o.euer_zeile, business_share = o.business_share
--   from public.category_tax_overrides o where o.category_id = c.id and o.user_id = c.user_id;
-- Die Overrides-Tabelle selbst bleibt (gehoert zu 20261028120000). Kein begin/commit (Aufrufer stellt die Transaktion).

create or replace view public.category_tree as
with recursive tree as (
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         c.id as root_id, c.name as root_name, 0 as depth, c.name as path,
         c.tax_role as tax_role_effective, c.euer_zeile as euer_zeile_effective,
         array[c.id] as seen
  from public.categories c
  where c.parent_id is null
     or not exists (select 1 from public.categories p where p.id = c.parent_id)
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         t.root_id, t.root_name, t.depth + 1, t.path || ' > ' || c.name,
         coalesce(c.tax_role, t.tax_role_effective), coalesce(c.euer_zeile, t.euer_zeile_effective),
         t.seen || c.id
  from public.categories c
  join tree t on c.parent_id = t.id
  where not (c.id = any (t.seen))
)
select tree.id, tree.user_id, tree.name, tree.parent_id, tree.type, tree.root_id, tree.root_name, tree.depth, tree.path,
       tree.tax_role_effective, tree.euer_zeile_effective
from tree
union all
select c.id, c.user_id, c.name, c.parent_id, c.type, c.id, c.name, 0, c.name, c.tax_role, c.euer_zeile
from public.categories c
where not exists (select 1 from tree t where t.id = c.id);

alter view public.category_tree set (security_invoker = on);

create or replace view public.unified_transactions as
with ct as materialized (
  select id, root_id, root_name, path, tax_role_effective, euer_zeile_effective from public.category_tree
)
select
  id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type,
  amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type,
  signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name,
  category_path, tax_role_effective, euer_zeile_effective,
  flow_kind = any (array['echt', 'anlage', 'forderung']) as counts_in_flow,
  category_source, ai_category_id, counterpart_account_id, flow_kind_extern
from (
  select
    t.id, t.user_id, t.account_id, a.name as account_name, a.color as account_color,
    t.category_id, c.name as category_name, c.color as category_color,
    t.date, t.type, t.amount, t.amount_base, t.fx_rate, t.currency, t.description, t.merchant,
    t.transfer_to, t.contract_id, t.tags,
    'manual'::text as source,
    c.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer' then 'umbuchung'
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    ct.tax_role_effective,
    ct.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id,
    case when t.type = 'transfer' then t.transfer_to else null::uuid end as counterpart_account_id,
    case
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.transactions t
  left join public.accounts a on a.id = t.account_id
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join ct on ct.id = t.category_id
  union all
  select
    bt.id, bt.user_id, a.id as account_id, a.name as account_name, a.color as account_color,
    bt.category_id, c.name as category_name, c.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'transfer'
      when bt.amount >= 0 then 'income'
      else 'expense'
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric as fx_rate,
    bt.currency,
    public.fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name) as description,
    bt.counterpart_name as merchant,
    case when coalesce(c.type, 'neutral') = 'neutral' then own.id else null::uuid end as transfer_to,
    null::uuid as contract_id,
    '{}'::text[] as tags,
    'bank_sync'::text as source,
    c.type as category_type,
    bt.amount as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    ct.tax_role_effective,
    ct.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id,
    own.id as counterpart_account_id,
    case
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.bank_transactions bt
  join lateral (
    select a0.id, a0.name, a0.color
    from public.accounts a0
    where a0.bank_iban = bt.account_iban
      and (a0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = a0.user_id))
    order by (a0.user_id = bt.user_id) desc, a0.created_at, a0.id
    limit 1
  ) a on true
  left join public.categories c on c.id = bt.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join lateral (
    select o0.id
    from public.accounts o0
    where o0.bank_iban = bt.counterpart_iban
      and (o0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = o0.user_id))
    order by (o0.user_id = bt.user_id) desc, o0.created_at, o0.id
    limit 1
  ) own on true
  left join ct on ct.id = bt.category_id
) u;

alter view public.unified_transactions set (security_invoker = on);

drop function if exists public.fn_category_tax_effective();
