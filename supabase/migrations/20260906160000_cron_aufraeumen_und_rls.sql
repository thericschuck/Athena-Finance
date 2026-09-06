-- Aufraeumen: ein sich selbst neu registrierender Cronjob, ein doppelter
-- Fondspreis-Job und zwei Tabellen ohne wirksame Zugriffsregeln.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Der Job, der sich selbst nachzieht
--
-- Job 1 ("Price Updates") lief alle FUENF MINUTEN und rief dabei nichts
-- Fachliches auf, sondern dreimal cron.schedule(): fetch-fund-price,
-- execute-contracts und execute-savings-plans wurden bei jedem Lauf neu
-- registriert. 576 Laeufe in 48 Stunden, alle "succeeded" -- er war erfolgreich
-- darin, nichts zu tun.
--
-- Zwei Folgen, die beide unangenehm sind: Last ohne Gegenwert, und die drei
-- Jobs liessen sich nicht abschalten. Wer einen davon entfernte, hatte ihn
-- fuenf Minuten spaeter zurueck.
--
-- Die drei Jobs bestehen unabhaengig weiter (jobid 24, 25, 26) -- cron.schedule
-- legt bei gleichem Namen keinen zweiten an, sondern aktualisiert. Das Loeschen
-- von Job 1 entfernt sie also NICHT.
--
-- Zum Wiederherstellen, falls das doch gebraucht wird: die Definition stand in
-- cron.job, jobid 1, Zeitplan '*/5 * * * *'.
select cron.unschedule(1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Der doppelte Fondspreis-Job
--
-- Zwei Jobs riefen dieselbe Edge Function in ueberlappenden Zeitfenstern:
--   jobid 23 "Fetch Fund Prices"  */15 7-19 * * 1-5  headers := jsonb_build_object()
--   jobid 24 "fetch-fund-price"   */15 8-20 * * 1-5  headers mit Authorization
--
-- Job 23 schickt LEERE Header. Genau daran ist schon einmal ein Cron-Aufruf
-- gescheitert (crypto_price_cache, behoben am 31.08.): ohne Authorization
-- antwortet die Edge Function mit 401, und pg_cron meldet trotzdem "succeeded",
-- weil net.http_post nur den Auftrag einstellt und nicht auf die Antwort wartet.
--
-- Deshalb bleibt Job 24 mit dem Authorization-Header, Job 23 geht.
select cron.unschedule(23);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) fints_client_state: RLS aktiv, keine einzige Policy
--
-- Dieselbe Klasse wie contract_executions vorher. Die Tabelle haelt die
-- Kundensystem-ID des FinTS-Clients -- sie ist der Grund, warum die Bank die
-- 90-Tage-Ausnahme nach PSD2 gewaehrt und nicht bei jedem Sync eine Freigabe
-- verlangt. Beide Sync-Pfade (Vercel-Python und lokaler Sidecar) teilen sie.
--
-- Geschrieben wird sie von den Sync-Pfaden mit dem Service-Role, der RLS
-- ohnehin umgeht. Die Policy hier stellt her, dass Eric seinen eigenen Zustand
-- auch aus der App LESEN kann -- fuer eine Anzeige "wann war der letzte Sync,
-- steht eine Freigabe an".
drop policy if exists "fints_client_state_own" on public.fints_client_state;

create policy "fints_client_state_own"
  on public.fints_client_state
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Die Backup-Tabelle wird GESICHERT, nicht geloescht
--
-- Der Plan sah vor, sie zu entfernen. Die Daten sagen etwas anderes:
--   175 Zeilen, 08.03. bis 29.08.2026
--   0 Tage, die es in net_worth_snapshots nicht auch gaebe
--   ABER: 175 von 175 Tagen haben dort einen ANDEREN net_worth
--
-- Das ist kein verwaistes Duplikat, sondern der Stand VOR der
-- Snapshot-Reparatur vom 02.09. Die Tabelle ist damit der einzige Beleg
-- dafuer, was die Zahlen vorher waren -- und bei einer Reparatur an der
-- Kernkennzahl ist das genau das, was man aufhebt, nicht wegwirft.
--
-- Was das eigentliche Problem war: RLS war nicht aktiviert, die Tabelle lag
-- also offen in einer Datenbank mit zwei echten Nutzern. Das wird hier
-- behoben. Ueber das Loeschen entscheidet Eric, wenn er die alten Werte nicht
-- mehr braucht.
alter table public.net_worth_snapshots_backup_20260830 enable row level security;

drop policy if exists "backup_20260830_own" on public.net_worth_snapshots_backup_20260830;

create policy "backup_20260830_own"
  on public.net_worth_snapshots_backup_20260830
  for select
  to authenticated
  using (user_id = (select auth.uid()));

comment on table public.net_worth_snapshots_backup_20260830 is
  'Stand der Snapshots VOR der Reparatur vom 02.09.2026. Alle 175 Tage haben in net_worth_snapshots inzwischen andere Werte. Aufbewahrt als Beleg der Reparatur, nicht mehr in Benutzung.';
