-- Sparplan-Buchungen: höchstens eine je (Nutzer, ISIN, Monat), als zweite Absicherung auf Datenbankebene.
-- (AUDIT.md A1)
--
-- Warum: execute-savings-plans fragt vor dem Buchen, ob es in diesem Monat schon eine Buchung gibt. Diese Abfrage war
-- fehlerhaft (`.like()` auf eine DATE-Spalte: Postgres meldet 42883 „operator does not exist: date ~~ unknown", der
-- Fehler wurde nicht gelesen). Folge im September 2026: 9 statt 1 Buchung für denselben Sparplan, eine pro Tag vom
-- 10. bis 17.9., am 17.9. sogar zwei im Abstand von 180 ms (zwei gleichzeitige Aufrufe). Die Anwendungsprüfung ist
-- seit dem Fix in der Function korrekt, ein Index schützt zusätzlich dort, wo eine Prüfung nie hinkommt: bei zwei
-- Aufrufen, die gleichzeitig lesen und dann beide schreiben, und gegen jeden künftigen Fehler in der Prüfung selbst.
--
-- Der Ausdruck `date_trunc('month', transaction_date::timestamp)`: Der Cast auf `timestamp` ist Pflicht.
-- `date_trunc('month', <date>)` löst auf die timestamptz-Variante auf, die STABLE ist (sie hängt von der Zeitzone der
-- Sitzung ab), und Postgres lehnt STABLE-Funktionen in Indexausdrücken ab („functions in index expression must be marked
-- IMMUTABLE"). Die timestamp-Variante ist IMMUTABLE (live am 2026-11-13 per pg_proc geprüft).
--
-- Wirkung auf die App: Die manuelle Aktion „Jetzt ausführen" (src/app/actions/depot.ts, executeSavingsPlanPayment) schreibt
-- ebenfalls `savings_plan`. Eine zweite Ausführung desselben Plans im selben Monat scheitert jetzt mit
-- „duplicate key value violates unique constraint" (die Oberfläche zeigt den Rohtext). Die Plan-Logik bietet den Knopf
-- ohnehin nur an, solange in diesem Monat noch keine Ausführung existiert (savingsPlanChecker.ts).
--
-- VORAUSSETZUNG: keine vorhandenen Duplikate, sonst lässt sich ein Unique-Index nicht anlegen. Live (2026-11-13) sind es
-- 8 überzählige Zeilen aus dem September 2026. Bereinigung: supabase/data/20261113_sparplan_duplikate_bereinigen.sql
-- (erst Trockenlauf lesen, dann löschen). Der Guard unten bricht mit einer lesbaren Meldung ab, solange noch welche da
-- sind, und ändert dann nichts.

do $guard$
declare
  v_doppelt text;
begin
  select string_agg(format('ISIN %s, %s: %s Buchungen', isin, monat, n), E'\n' order by monat, isin)
    into v_doppelt
  from (
    select isin, to_char(date_trunc('month', transaction_date::timestamp), 'YYYY-MM') as monat, count(*) as n
    from public.depot_transactions
    where transaction_type = 'savings_plan'
    group by user_id, isin, date_trunc('month', transaction_date::timestamp)
    having count(*) > 1
  ) d;

  if v_doppelt is not null then
    raise exception 'Es gibt doppelte Sparplan-Buchungen. Zuerst bereinigen: supabase/data/20261113_sparplan_duplikate_bereinigen.sql. Es wurde nichts geändert.'
      using detail = v_doppelt;
  end if;
end
$guard$;

create unique index if not exists depot_transactions_savings_plan_monat_uidx
  on public.depot_transactions (user_id, isin, (date_trunc('month', transaction_date::timestamp)))
  where transaction_type = 'savings_plan';

comment on index public.depot_transactions_savings_plan_monat_uidx is
  'Höchstens eine savings_plan-Buchung je Nutzer, ISIN und Monat. Zweite Absicherung zur Prüfung in supabase/functions/execute-savings-plans (AUDIT.md A1).';
