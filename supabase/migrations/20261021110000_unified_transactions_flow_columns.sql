/**
 * unified_transactions: neue Spalten für den einheitlichen Datenpool. Rein additiv —
 * alle bisherigen Spalten stehen unverändert an derselben Stelle, neue kommen ans Ende
 * (Voraussetzung für CREATE OR REPLACE VIEW; account_balance_sums_unified bleibt gültig).
 *
 * Entscheidung vom 2026-10-21:
 *   Anlage (Krypto/Depot/Bauspar/Sparkonto) UND Forderungen zählen als Einnahme bzw.
 *   Ausgabe. Nur Umbuchungen zwischen eigenen Konten und Anfangsbestände nicht.
 *   `flow_kind` bleibt als Merkmal erhalten, damit sich Konsum und Anlage trennen lassen.
 *
 * Reihenfolge der neuen Spalten: amount_eur, root_category_id, root_category_name,
 * category_path, tax_role_effective, euer_zeile_effective, counts_in_flow (zuletzt).
 *
 *   counts_in_flow  true für echt / anlage / forderung, false für umbuchung / anfangsbestand
 *   amount_eur      Betrag in Basiswährung, immer positiv (abs von amount_base, sonst amount * fx_rate)
 *   root_category_id / root_category_name / category_path   siehe category_tree
 *   tax_role_effective / euer_zeile_effective              vererbt, siehe category_tree
 *
 * Die flow_kind-Regeln selbst sind NICHT geändert (Migration 20260902100000).
 *
 * Rollback: supabase/rollbacks/20261021110000_unified_transactions_flow_columns.down.sql
 */

-- ACHTUNG: `with (security_invoker = on)` MUSS hier stehen. CREATE OR REPLACE VIEW ohne WITH-Klausel
-- setzt die Reloptions auf den Default zurück, die View liefe dann wieder mit Owner-Rechten und
-- umginge die RLS (genau das war bis 20261020130000 in Produktion der Fall). Grants bleiben erhalten.
create or replace view public.unified_transactions
with (security_invoker = on) as
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
    left join category_tree ct on ct.id = t.category_id

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
    left join category_tree ct on ct.id = bt.category_id
) u;
