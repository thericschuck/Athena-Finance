-- Verträge und Abos buchen nichts mehr.
--
-- Der Job "execute-contracts" (jobid 25, täglich 8 Uhr) legte für jeden fälligen Vertrag selbst eine
-- Buchung in `transactions` an — auch dann, wenn auf dem Konto nie etwas abgebucht wurde. Die App
-- prüft jetzt nur noch, ob zum Termin eine passende Buchung eingegangen ist, und weist sonst darauf hin.
select cron.unschedule(jobid) from cron.job where jobname = 'execute-contracts';

-- Die einzige noch vorhandene vom Job erzeugte Buchung (Supabase, 44 €, 24.10.2026): auf dem Konto gibt
-- es keine Abbuchung in dieser Höhe. Gelöscht wird über die Protokollzeile, nicht über Beschreibung/Betrag.
with weg as (
  delete from contract_executions ce
  using transactions t
  where t.id = ce.transaction_id
  returning ce.transaction_id
)
delete from transactions where id in (select transaction_id from weg);
