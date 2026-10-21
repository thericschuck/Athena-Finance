/**
 * Die Cron-Tabelle `monthly_finance_summary` wird nicht mehr geschrieben.
 *
 * Alle Leser (Dashboard, Analyse, Verlauf, Reports, Athena) lesen seit der Datenpool-Umstellung
 * aus `monthly_flows` bzw. `monthly_flow_totals`. Die Tabelle hatte zwei Probleme: ihre Buckets
 * (salary, food, leisure, …) beruhten auf Namensmustern und lagen bei Unterkategorien daneben,
 * und sie driftete, weil sie nur bei Cron und Sync neu gerechnet wurde.
 *
 * `fn_recompute_monthly_summary` bleibt als No-op bestehen: fn_take_snapshot und der Sync rufen
 * sie auf, und ein Entfernen würde beide brechen. Die Tabelle bleibt mit ihrer Historie als
 * Archiv (lesbar, kein Löschen) und kann später gedroppt werden.
 *
 * Rollback: supabase/rollbacks/20261021140000_retire_monthly_summary_writes.down.sql
 */

create or replace function public.fn_recompute_monthly_summary(p_uid uuid, p_month date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Absichtlich leer, siehe Kommentar der Migration.
  return;
end;
$function$;

comment on table public.monthly_finance_summary is
  'ARCHIV seit 2026-10-21: wird nicht mehr geschrieben und nicht mehr gelesen. Live-Summen stehen in monthly_flows / monthly_flow_totals.';
