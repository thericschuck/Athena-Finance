/**
 * `monthly_flows` — die eine Aggregation für Einnahmen und Ausgaben.
 *
 * Dashboard, Analyse, Banking, Konto-Detail, Reports und Athena sollen ihre Summen
 * künftig hieraus lesen, statt jeweils selbst zu filtern und im Client zu summieren
 * (PostgREST deckelt Antworten still bei 1.000 Zeilen).
 *
 * Eine Zeile je Nutzer, Monat, Konto, Quelle, flow_kind und Kategorie. Nur Buchungen mit
 * counts_in_flow (echt, anlage, forderung); Umbuchungen und Anfangsbestände fehlen
 * absichtlich. Wer Konsum ohne Anlage will, filtert auf flow_kind = 'echt'.
 *
 * Läuft mit security_invoker: die RLS des Aufrufers greift (wie bei den anderen Views).
 *
 * Rollback: supabase/rollbacks/20261021120000_monthly_flows.down.sql
 */

create or replace view public.monthly_flows
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', date)::date as month,
  account_id,
  source,
  flow_kind,
  category_id,
  category_name,
  root_category_id,
  root_category_name,
  tax_role_effective,
  coalesce(sum(amount_eur) filter (where type = 'income'),  0::numeric) as income,
  coalesce(sum(amount_eur) filter (where type = 'expense'), 0::numeric) as expense,
  count(*)::integer as tx_count
from public.unified_transactions
where counts_in_flow
group by
  user_id, date_trunc('month', date)::date, account_id, source, flow_kind,
  category_id, category_name, root_category_id, root_category_name, tax_role_effective;

revoke all on public.monthly_flows from anon, authenticated;
grant select on public.monthly_flows to authenticated;
