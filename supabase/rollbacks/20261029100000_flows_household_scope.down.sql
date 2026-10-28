-- Rollback zu 20261029100000_flows_household_scope.sql: Stand vom 2026-10-26 (Live-Definitionen per pg_get_viewdef).
-- CREATE OR REPLACE kann die Spalten counterpart_account_id/flow_kind_extern nicht entfernen, deshalb drop + create
-- der abhaengigen Kette (monthly_umbuchungen, monthly_flow_totals, monthly_flows, account_balance_sums_unified).
-- account_balance_sums_manual haengt nicht an unified_transactions und bleibt unberuehrt.
-- ACHTUNG: App-Code, der counterpart_account_id / flow_kind_extern / monthly_umbuchungen liest, vorher zurueckbauen.
-- Kein begin/commit: Aufrufer (apply_migration / DO-Block) stellt die Transaktion. Scheitert ein Schritt, bleibt alles beim Alten.

drop view if exists public.monthly_umbuchungen;
drop view if exists public.monthly_flow_totals;
drop view if exists public.monthly_flows;
drop view if exists public.account_balance_sums_unified;
drop view if exists public.unified_transactions;

create view public.unified_transactions
with (security_invoker = on) as
with ct as materialized (
  select id, root_id, root_name, path, tax_role_effective, euer_zeile_effective from public.category_tree
)
select
  id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type,
  amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type,
  signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name,
  category_path, tax_role_effective, euer_zeile_effective,
  flow_kind = any (array['echt', 'anlage', 'forderung']) as counts_in_flow,
  category_source, ai_category_id
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
    ct.root_id as root_category_id, ct.root_name as root_category_name, ct.path as category_path,
    ct.tax_role_effective, ct.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id
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
    fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name) as description,
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
    ct.root_id as root_category_id, ct.root_name as root_category_name, ct.path as category_path,
    ct.tax_role_effective, ct.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id
  from public.bank_transactions bt
  join public.accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
  left join public.categories c on c.id = bt.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join public.accounts own on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban
  left join ct on ct.id = bt.category_id
) u;

revoke all on public.unified_transactions from anon, authenticated;
grant select on public.unified_transactions to authenticated;

create view public.monthly_flows
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', date::timestamp with time zone)::date as month,
  account_id, source, flow_kind, category_id, category_name, root_category_id, root_category_name, tax_role_effective,
  coalesce(sum(amount_eur) filter (where type = 'income'), 0::numeric) as income,
  coalesce(sum(amount_eur) filter (where type = 'expense'), 0::numeric) as expense,
  count(*)::integer as tx_count
from public.unified_transactions
where counts_in_flow
group by user_id, (date_trunc('month', date::timestamp with time zone)::date), account_id, source, flow_kind,
         category_id, category_name, root_category_id, root_category_name, tax_role_effective;

revoke all on public.monthly_flows from anon, authenticated;
grant select on public.monthly_flows to authenticated;

create view public.monthly_flow_totals
with (security_invoker = on) as
select
  user_id, month,
  sum(income) as income,
  sum(expense) as expense,
  coalesce(sum(income)  filter (where flow_kind = 'echt'), 0::numeric) as echt_income,
  coalesce(sum(expense) filter (where flow_kind = 'echt'), 0::numeric) as echt_expense,
  coalesce(sum(income)  filter (where flow_kind = 'anlage'), 0::numeric) as anlage_income,
  coalesce(sum(expense) filter (where flow_kind = 'anlage'), 0::numeric) as anlage_expense,
  coalesce(sum(income)  filter (where flow_kind = 'forderung'), 0::numeric) as forderung_income,
  coalesce(sum(expense) filter (where flow_kind = 'forderung'), 0::numeric) as forderung_expense,
  sum(tx_count)::integer as tx_count
from public.monthly_flows
group by user_id, month;

revoke all on public.monthly_flow_totals from anon, authenticated;
grant select on public.monthly_flow_totals to authenticated;

create view public.account_balance_sums_unified
with (security_invoker = on) as
select user_id, account_id, sum(delta) as balance, count(*) filter (where eigen)::integer as tx_count
from (
  select u.user_id, u.account_id, true as eigen,
         case u.type
           when 'income'   then u.amount
           when 'expense'  then -u.amount
           when 'transfer' then u.signed_amount
           else 0::numeric
         end as delta
  from public.unified_transactions u
  where u.account_id is not null
  union all
  select u.user_id, u.transfer_to, false, u.amount
  from public.unified_transactions u
  where u.source = 'manual' and u.type = 'transfer' and u.transfer_to is not null
) m
group by user_id, account_id;

revoke all on public.account_balance_sums_unified from anon, authenticated;
grant select on public.account_balance_sums_unified to authenticated;

-- service_role hatte auf diesen Views vollen Zugriff (Supabase-Default-Privileges); wiederherstellen.
grant all on public.unified_transactions, public.monthly_flows, public.monthly_flow_totals,
             public.account_balance_sums_unified to service_role;
