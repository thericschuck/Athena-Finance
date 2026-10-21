-- Rollback zu 20261022120000_own_iban_category_override.sql: die Fassung aus 20261021180000_category_tree_fast.sql
-- (Gegen-IBAN = eigenes Konto ist immer eine Umbuchung, egal welche Kategorie). `with (security_invoker = on)` bleibt.
create or replace view public.unified_transactions
with (security_invoker = on) as
with ct as materialized (
  select id, root_id, root_name, path, tax_role_effective, euer_zeile_effective
  from public.category_tree
)
select
  u.*,
  (u.flow_kind in ('echt', 'anlage', 'forderung')) as counts_in_flow
from (
  select
    t.id,
    t.user_id,
    t.account_id,
    a.name  as account_name,
    a.color as account_color,
    t.category_id,
    c.name  as category_name,
    c.color as category_color,
    t.date,
    t.type,
    t.amount,
    t.amount_base,
    t.fx_rate,
    t.currency,
    t.description,
    t.merchant,
    t.transfer_to,
    t.contract_id,
    t.tags,
    'manual'::text as source,
    c.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer'                                             then 'umbuchung'
      when t.description ilike 'alter kontostand%'                         then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))) as amount_eur,
    ct.root_id    as root_category_id,
    ct.root_name  as root_category_name,
    ct.path       as category_path,
    ct.tax_role_effective,
    ct.euer_zeile_effective
  from transactions t
    left join accounts a    on a.id = t.account_id
    left join categories c  on c.id = t.category_id
    left join categories pc on pc.id = c.parent_id
    left join ct on ct.id = t.category_id

  union all

  select
    bt.id,
    bt.user_id,
    a.id    as account_id,
    a.name  as account_name,
    a.color as account_color,
    bt.category_id,
    c.name  as category_name,
    c.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null      then 'transfer'::text
      when bt.amount >= 0::numeric then 'income'::text
      else 'expense'::text
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric     as fx_rate,
    bt.currency,
    fn_clean_bank_description(
      coalesce(bt.description, bt.raw_description), bt.counterpart_name
    ) as description,
    bt.counterpart_name as merchant,
    own.id              as transfer_to,
    null::uuid          as contract_id,
    '{}'::text[]        as tags,
    'bank_sync'::text   as source,
    c.type              as category_type,
    bt.amount           as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null                                              then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ct.root_id    as root_category_id,
    ct.root_name  as root_category_name,
    ct.path       as category_path,
    ct.tax_role_effective,
    ct.euer_zeile_effective
  from bank_transactions bt
    join accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
    left join categories c  on c.id = bt.category_id
    left join categories pc on pc.id = c.parent_id
    left join accounts own  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban
    left join ct on ct.id = bt.category_id
) u;
