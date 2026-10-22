/**
 * bank_transactions.ai_checked_at + unified_transactions: Herkunft der Kategorie sichtbar machen.
 *
 * `category_source` (auto / ai / manual) und `ai_category_id` kommen als LETZTE Spalten in die View, damit die
 * Transaktionsliste eine KI-Marke zeigen und KI-Vorschläge ("offen, aber vorgeschlagen") erkennen kann. Manuelle
 * Buchungen (Tabelle transactions) haben beides nicht (null). Die übrigen Spalten und ihre Reihenfolge bleiben,
 * deshalb zählt `counts_in_flow` weiter an derselben Stelle; die äußere Auswahl ist dafür ausdrücklich aufgelistet.
 *
 * `ai_checked_at`: wann die KI diese (noch unkategorisierte) Buchung zuletzt geprüft hat. Unsichere Buchungen werden so
 * nicht alle sechs Stunden erneut abgefragt.
 *
 * Rollback: supabase/rollbacks/20261022140000_ai_markierung.down.sql
 */
alter table public.bank_transactions add column if not exists ai_checked_at timestamptz;

-- ACHTUNG: `with (security_invoker = on)` MUSS stehen bleiben (siehe docs/datenpool.md, "Ändern").
create or replace view public.unified_transactions
with (security_invoker = on) as
with ct as materialized (
  select id, root_id, root_name, path, tax_role_effective, euer_zeile_effective
  from public.category_tree
)
select
  u.id,
  u.user_id,
  u.account_id,
  u.account_name,
  u.account_color,
  u.category_id,
  u.category_name,
  u.category_color,
  u.date,
  u.type,
  u.amount,
  u.amount_base,
  u.fx_rate,
  u.currency,
  u.description,
  u.merchant,
  u.transfer_to,
  u.contract_id,
  u.tags,
  u.source,
  u.category_type,
  u.signed_amount,
  u.booked_date,
  u.description_raw,
  u.flow_kind,
  u.amount_eur,
  u.root_category_id,
  u.root_category_name,
  u.category_path,
  u.tax_role_effective,
  u.euer_zeile_effective,
  (u.flow_kind in ('echt', 'anlage', 'forderung')) as counts_in_flow,
  u.category_source,
  u.ai_category_id
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
    ct.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id
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
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'transfer'::text
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
    case when coalesce(c.type, 'neutral') = 'neutral' then own.id end as transfer_to,
    null::uuid          as contract_id,
    '{}'::text[]        as tags,
    'bank_sync'::text   as source,
    c.type              as category_type,
    bt.amount           as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ct.root_id    as root_category_id,
    ct.root_name  as root_category_name,
    ct.path       as category_path,
    ct.tax_role_effective,
    ct.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id
  from bank_transactions bt
    join accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
    left join categories c  on c.id = bt.category_id
    left join categories pc on pc.id = c.parent_id
    left join accounts own  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban
    left join ct on ct.id = bt.category_id
) u;
