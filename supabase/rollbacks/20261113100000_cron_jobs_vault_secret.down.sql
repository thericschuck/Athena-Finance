-- Rollback zu 20261113100000_cron_jobs_vault_secret.sql: stellt die alten Job-Kommandos wieder her, mit dem
-- anon-Key im Klartext. Das ist der Zustand, den SECURITY-AUDIT.md S1 als Lücke beschreibt. Nur bei Bedarf.
--
-- Zusammen mit dem Rückbau der Functions (alter Code, verify_jwt = true), sonst antworten sie mit 401: Der neue
-- Code erwartet das CRON_SECRET, der alte Job-Aufruf schickt den anon-Key.
--
-- Den anon-Key (Supabase Dashboard → Project Settings → API) unten bei v_anon eintragen. Er steht absichtlich nicht
-- in dieser Datei. Der Platzhalter lässt den Rollback abbrechen, bevor etwas geändert wird.
--
-- Das Vault-Secret `cron_secret` bleibt bestehen (löschen: delete from vault.secrets where name = 'cron_secret';).
do $rollback$
declare
  v_anon text := '<ANON_KEY>';
  v_base text := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/';
begin
  if v_anon like '<%' or length(v_anon) < 100 then
    raise exception 'Zuerst den anon-Key bei v_anon eintragen. Es wurde nichts geändert.';
  end if;

  perform cron.alter_job(
    job_id  := (select jobid from cron.job where jobname = 'fetch-fund-price'),
    command := format($c$select net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := '{}'::jsonb
    ) as request_id;$c$, v_base || 'fetch-fund-price', json_build_object('Authorization', 'Bearer ' || v_anon, 'Content-Type', 'application/json')::text)
  );

  perform cron.alter_job(
    job_id  := (select jobid from cron.job where jobname = 'execute-savings-plans'),
    command := format($c$select net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := '{}'::jsonb
    ) as request_id;$c$, v_base || 'execute-savings-plans', json_build_object('Authorization', 'Bearer ' || v_anon, 'Content-Type', 'application/json')::text)
  );

  perform cron.alter_job(
    job_id  := (select jobid from cron.job where jobname = 'Daily-Snapshot'),
    command := format($c$
select net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
$c$, v_base || 'daily-snapshot', json_build_object('Authorization', 'Bearer ' || v_anon, 'Content-Type', 'application/json')::text)
  );
end
$rollback$;
