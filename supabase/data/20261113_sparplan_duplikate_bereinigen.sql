-- Einmalige Datenbereinigung: doppelte Sparplan-Buchungen (AUDIT.md A1).
--
-- NICHT ausführen, bevor du Schritt 1 gelesen hast. Schritt 2 löscht Zeilen aus depot_transactions und steht deshalb
-- auskommentiert da. Dies ist ein Datenskript, keine Migration (supabase/data/ wird nicht von `db push` erfasst).
--
-- Befund (live gelesen am 2026-11-13): ISIN DE0008491051, September 2026, 9 Buchungen à 25,00 EUR statt 1.
--   10.9. bis 16.9. je eine, am 17.9. zwei (180 ms auseinander). Alle mit dem Vermerk „Automatische Sparplan-
--   Ausführung", angelegt jeweils um 09:00 UTC vom Cron-Job. Ursache: fehlerhafte Doppelbuchungsprüfung, siehe
--   supabase/migrations/20261113110000_savings_plan_unique_per_month.sql. Der Sparplan selbst existiert nicht mehr
--   (savings_plans ist leer), es entstehen also keine neuen Duplikate.
--   Überzählig: 8 Zeilen = 200,00 EUR = 0,400159 Anteile, bei 510,00 EUR Kurs heute ca. 204,08 EUR, um die Depotwert
--   und „investiert" zu hoch ausgewiesen werden.
--
-- Regel: Je (Nutzer, ISIN, Monat) bleibt die ZUERST angelegte Buchung (created_at, dann id), alle späteren sind
-- überzählig. Hier ist das die vom 10.9. (der erste Lauf nach der Reparatur des `shares`-Fehlers am 9.9.). Ob das
-- fachlich die „richtige" des Monats ist, lässt sich nicht mehr feststellen, der Plan ist weg. Es zählt, dass der
-- Monat genau einmal 25,00 EUR enthält.
--
-- Nach dem Löschen: Der Unique-Index aus der Migration lässt sich anlegen.
-- Nicht Teil dieses Skripts: die bereits gespeicherten Tages-Snapshots (net_worth_snapshots) ab dem 10.9. enthalten die
-- überzähligen ~200 EUR weiter im Depotanteil. fn_take_snapshot für alte Tage neu laufen zu lassen ist KEIN sicherer
-- Weg: Die Function rechnet einen Tag mit den heutigen Beständen (z. B. Krypto) neu und würde diese Teile der
-- Historie überschreiben. Das ist eine eigene Entscheidung.

-- ─────────────────────────────────────────────────────────────────────────────
-- Schritt 1: Trockenlauf (nur lesen). BEHALTEN = bleibt, LOESCHEN = würde in Schritt 2 gelöscht.
-- ─────────────────────────────────────────────────────────────────────────────
with gruppen as (
  select user_id, isin, date_trunc('month', transaction_date::timestamp) as monat
  from public.depot_transactions
  where transaction_type = 'savings_plan'
  group by 1, 2, 3
  having count(*) > 1
), nummeriert as (
  select t.id, t.user_id, t.isin, t.transaction_date, t.amount_eur, t.price_per_share, t.shares, t.created_at,
         row_number() over (
           partition by t.user_id, t.isin, date_trunc('month', t.transaction_date::timestamp)
           order by t.created_at, t.id
         ) as rn
  from public.depot_transactions t
  join gruppen g
    on g.user_id = t.user_id and g.isin = t.isin and g.monat = date_trunc('month', t.transaction_date::timestamp)
  where t.transaction_type = 'savings_plan'
)
select case when rn = 1 then 'BEHALTEN' else 'LOESCHEN' end as aktion,
       id, isin, transaction_date, amount_eur, price_per_share, round(shares, 6) as anteile, created_at
from nummeriert
order by isin, created_at, id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schritt 2: Löschen. Zum Ausführen die Kommentarzeichen entfernen, in EINEM Lauf mit begin/commit.
-- `returning *` liefert die gelöschten Zeilen vollständig zurück: Ergebnis als Protokoll speichern (CSV-Export im
-- SQL-Editor), bevor du `commit` ausführst. Erwartet: 8 Zeilen. Stimmt die Zahl nicht: `rollback` statt `commit`.
-- ─────────────────────────────────────────────────────────────────────────────
-- begin;
--
-- with gruppen as (
--   select user_id, isin, date_trunc('month', transaction_date::timestamp) as monat
--   from public.depot_transactions
--   where transaction_type = 'savings_plan'
--   group by 1, 2, 3
--   having count(*) > 1
-- ), nummeriert as (
--   select t.id,
--          row_number() over (
--            partition by t.user_id, t.isin, date_trunc('month', t.transaction_date::timestamp)
--            order by t.created_at, t.id
--          ) as rn
--   from public.depot_transactions t
--   join gruppen g
--     on g.user_id = t.user_id and g.isin = t.isin and g.monat = date_trunc('month', t.transaction_date::timestamp)
--   where t.transaction_type = 'savings_plan'
-- )
-- delete from public.depot_transactions
-- where id in (select id from nummeriert where rn > 1)
-- returning *;
--
-- -- Gegenprobe (muss 0 Zeilen liefern):
-- select user_id, isin, date_trunc('month', transaction_date::timestamp) as monat, count(*)
-- from public.depot_transactions where transaction_type = 'savings_plan'
-- group by 1, 2, 3 having count(*) > 1;
--
-- commit;   -- oder: rollback;
