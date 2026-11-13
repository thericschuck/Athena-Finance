-- Cron-Jobs → Edge Functions: Bearer-Secret aus supabase_vault statt anon-Key im Klartext im Job-Kommando.
-- (SECURITY-AUDIT.md S1, Maßnahme 2)
--
-- Vorher (live geprüft am 2026-11-13): drei pg_cron-Jobs, in jedem steht `Authorization: Bearer <anon-JWT>` fest im
-- Job-Kommando (cron.job.command, damit auch in cron.job_run_details). Das ist der ÖFFENTLICHE Schlüssel aus dem
-- Browser-Bundle: Wer die Seite öffnet, kennt ihn, und die Functions liefen mit Service-Role.
--
--   jobid 24    fetch-fund-price       */15 8-20 * * 1-5
--   jobid 26    execute-savings-plans  0 9 * * *
--   jobid 1287  Daily-Snapshot         59 23 * * *   (mit timeout_milliseconds := 60000)
--
-- Nachher: Die Jobs lesen das Secret bei JEDEM Lauf aus vault.decrypted_secrets. Im Job-Kommando steht nur noch der
-- Name `cron_secret`, nie der Wert. Zeitplan, Datenbank, Besitzer (postgres) und Aktiv-Status der Jobs bleiben
-- unverändert: cron.alter_job tauscht ausschließlich das Kommando.
--
-- VORAUSSETZUNGEN, beide VOR dem Ausführen (fehlt eine, wird die Migration nicht ausgeführt bzw. die Jobs scheitern):
--
--   1. Secret im Vault anlegen, derselbe Wert wie CRON_SECRET in den Edge-Function-Secrets (und in Vercel):
--        select vault.create_secret('<CRON_SECRET>', 'cron_secret', 'Bearer-Secret der pg_cron-Jobs für die Edge Functions');
--      Der Guard unten bricht ab, wenn es fehlt oder kürzer als 32 Zeichen ist.
--
--   2. Die drei Functions mit dem neuen Code deployt haben (supabase/functions/*/cron-auth.ts, verify_jwt = false aus
--      config.toml). Davor weist die Plattform (verify_jwt = true) das Secret als „kein JWT" mit 401 ab, das lässt
--      sich aus SQL nicht prüfen. Reihenfolge und Zeitfenster: siehe Antwort zum Schritt in SECURITY-AUDIT.md.
--
-- Rotation später, ohne diese Datei anzufassen:
--   select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<neuer Wert>');
--   (danach auch CRON_SECRET der Edge Functions und von Vercel auf denselben Wert setzen)
--
-- Fehlbild, falls das Vault-Secret später gelöscht wird: `'Bearer ' || NULL` ist NULL, der Header wird zu JSON-null,
-- die Function antwortet 401. Der Job läuft dann „erfolgreich" durch (pg_cron sieht nur, dass net.http_post den Auftrag
-- angenommen hat). Ob die Läufe ankommen, zeigt: select id, status_code, left(content, 80) from net._http_response
-- order by created desc limit 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- Guard: nichts ändern, solange die Voraussetzungen nicht stehen
-- ─────────────────────────────────────────────────────────────────────────────
do $guard$
declare
  v_name text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secret' and length(decrypted_secret) >= 32
  ) then
    raise exception 'Vault-Secret "cron_secret" fehlt oder ist kürzer als 32 Zeichen. Zuerst anlegen: select vault.create_secret(''<CRON_SECRET>'', ''cron_secret'', ''Bearer-Secret der pg_cron-Jobs für die Edge Functions'');';
  end if;

  foreach v_name in array array['fetch-fund-price', 'execute-savings-plans', 'Daily-Snapshot'] loop
    if not exists (select 1 from cron.job where jobname = v_name) then
      raise exception 'pg_cron-Job "%" nicht gefunden. Abbruch, es wurde nichts geändert.', v_name;
    end if;
  end loop;
end
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Die drei Jobs: nur das Kommando wird getauscht
-- ─────────────────────────────────────────────────────────────────────────────
select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'fetch-fund-price'),
  command := $cmd$
select net.http_post(
    url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/fetch-fund-price',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
$cmd$
);

select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'execute-savings-plans'),
  command := $cmd$
select net.http_post(
    url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/execute-savings-plans',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
$cmd$
);

select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'Daily-Snapshot'),
  command := $cmd$
select net.http_post(
    url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/daily-snapshot',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
$cmd$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Gegenprobe in derselben Transaktion: schlägt sie fehl, wird alles zurückgerollt
-- ─────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if exists (
    select 1 from cron.job
    where jobname in ('fetch-fund-price', 'execute-savings-plans', 'Daily-Snapshot')
      and command ~ 'eyJ'
  ) then
    raise exception 'In einem Job-Kommando steht noch ein JWT im Klartext.';
  end if;

  if (
    select count(*) from cron.job
    where jobname in ('fetch-fund-price', 'execute-savings-plans', 'Daily-Snapshot')
      and command like '%vault.decrypted_secrets%'
      and command like '%''cron_secret''%'
  ) <> 3 then
    raise exception 'Nicht alle drei Jobs lesen cron_secret aus dem Vault.';
  end if;

  if exists (
    select 1 from cron.job
    where jobname in ('fetch-fund-price', 'execute-savings-plans', 'Daily-Snapshot') and not active
  ) then
    raise exception 'Ein Job ist inaktiv. Diese Migration darf den Aktiv-Status nicht ändern.';
  end if;
end
$check$;
