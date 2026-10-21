/**
 * `monthly_flow_totals` — eine Zeile je Nutzer und Monat, abgeleitet aus `monthly_flows`.
 *
 * Ersetzt für die Leseseite die Cron-Tabelle `monthly_finance_summary` (Verlauf → Monatsübersicht).
 * Die Tabelle trug Namensmuster-Buckets (salary, food, leisure, …), die auf `LIKE '%gehalt%'` und
 * Ähnlichem beruhten und bei Unterkategorien danebenlagen, und sie driftete: sie wurde nur bei
 * Cron und Sync neu gerechnet, nicht bei Änderungen an Buchungen oder Kategorien. Diese View
 * rechnet immer live aus derselben Quelle wie alle anderen Auswertungen.
 *
 *   income / expense               alles, was zählt (echt + anlage + forderung)
 *   echt_*, anlage_*, forderung_*  dieselben Summen je Art
 *
 * Rollback: supabase/rollbacks/20261021130000_monthly_flow_totals.down.sql
 */

create or replace view public.monthly_flow_totals
with (security_invoker = on) as
select
  user_id,
  month,
  sum(income)  as income,
  sum(expense) as expense,
  coalesce(sum(income)  filter (where flow_kind = 'echt'),      0::numeric) as echt_income,
  coalesce(sum(expense) filter (where flow_kind = 'echt'),      0::numeric) as echt_expense,
  coalesce(sum(income)  filter (where flow_kind = 'anlage'),    0::numeric) as anlage_income,
  coalesce(sum(expense) filter (where flow_kind = 'anlage'),    0::numeric) as anlage_expense,
  coalesce(sum(income)  filter (where flow_kind = 'forderung'), 0::numeric) as forderung_income,
  coalesce(sum(expense) filter (where flow_kind = 'forderung'), 0::numeric) as forderung_expense,
  sum(tx_count)::integer as tx_count
from public.monthly_flows
group by user_id, month;

revoke all on public.monthly_flow_totals from anon, authenticated;
grant select on public.monthly_flow_totals to authenticated;
