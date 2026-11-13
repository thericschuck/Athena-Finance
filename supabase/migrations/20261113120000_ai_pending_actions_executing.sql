-- ai_pending_actions: Status `executing` zulassen (AUDIT.md A2).
--
-- Warum: confirmPendingAction beansprucht einen Vorschlag jetzt VOR der Ausfuehrung atomar
-- (`update ... set status = 'executing' where id = ... and status = 'pending' returning id`, siehe
-- src/lib/assistant/bestaetigung.ts). Zwei gleichzeitige Bestaetigungen fuehren die Aktion so nicht mehr doppelt aus. Das
-- betrifft vor allem `executeRebalancing`: die Aktion platziert echte Kraken-Market-Orders, ein Doppelklick kaufte Kauf-Legs
-- doppelt.
--
-- Der CHECK-Constraint (20260830100000_athena_agent.sql) kennt `executing` nicht. OHNE diese Migration scheitert das
-- Beanspruchen mit 23514 (check constraint violation): jede Bestaetigung einer Athena-Aktion meldet dann einen Fehler und
-- fuehrt NICHTS aus (sicher, aber unbrauchbar). Darum: ZUERST diese Migration anwenden, DANACH den App-Code ausliefern.
--
-- Wirkung auf bestehende Daten: keine. Live (2026-11-13) stehen 98 Zeilen auf executed, 3 auf rejected, 2 auf failed, keine
-- auf pending/executing. Die neue Bedingung ist eine Obermenge der alten, jede vorhandene Zeile erfuellt sie.
--
-- Eine Zeile, die auf `executing` stehen bleibt (Prozess abgestuerzt, Function-Timeout), wird NIE automatisch wiederholt:
-- bei Kraken-Orders weiss man dann nicht, ob die Order raus ist. Sie bleibt fuer eine manuelle Pruefung sichtbar, zu finden mit
--   select id, action, summary, created_at from ai_pending_actions where status = 'executing';

alter table public.ai_pending_actions
  drop constraint if exists ai_pending_actions_status_check;

alter table public.ai_pending_actions
  add constraint ai_pending_actions_status_check
  check (status in ('pending', 'executing', 'executed', 'rejected', 'failed', 'expired'));
