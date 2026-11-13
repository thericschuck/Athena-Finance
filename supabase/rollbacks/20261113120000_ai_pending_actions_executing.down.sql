-- Rollback zu 20261113120000_ai_pending_actions_executing.sql: Status `executing` wieder verbieten.
--
-- ZUERST den App-Code zurueckrollen (sonst scheitert jede Bestaetigung am Constraint). Der Guard bricht ab, solange Zeilen auf
-- `executing` stehen: sie wuerden den alten Constraint verletzen. Zeilen vorher einzeln pruefen (bei Kraken-Orders: ist die
-- Order raus? kraken_order_log, Kraken-Konto) und von Hand auf `executed` oder `failed` setzen.

do $guard$
declare
  n int;
begin
  select count(*) into n from public.ai_pending_actions where status = 'executing';
  if n > 0 then
    raise exception 'Es gibt % Zeile(n) mit status = executing. Erst pruefen und auf executed/failed setzen. Es wurde nichts geaendert.', n;
  end if;
end
$guard$;

alter table public.ai_pending_actions
  drop constraint if exists ai_pending_actions_status_check;

alter table public.ai_pending_actions
  add constraint ai_pending_actions_status_check
  check (status in ('pending', 'executed', 'rejected', 'failed', 'expired'));
