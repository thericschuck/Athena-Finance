import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alsTag, faelligkeitenIm } from './recurrence.ts'

/**
 * Diese Tests sind der Grund, warum die Wiederkehr-Logik ein eigenes Modul ist.
 * Sie existiert zweimal — hier und als `isDueToday` in
 * `supabase/functions/execute-contracts/index.ts`, wo sie die Buchungen
 * tatsaechlich anlegt. Laufen die beiden auseinander, nennt Athena Termine, an
 * denen nichts abgebucht wird.
 *
 * Die ersten drei Faelle sind aus Erics echten Daten abgeleitet: die Sollwerte
 * sind die Ausfuehrungsdaten, die am 06.09.2026 in `contract_executions`
 * standen. Wenn einer davon rot wird, hat sich die Semantik geaendert und nicht
 * nur der Code.
 *
 * Laufen mit: npm test
 */

const vertrag = (
  start: string,
  freq: string,
  tag: number | null,
  ende: string | null = null,
) => ({ start_date: start, frequency: freq, billing_day: tag, end_date: ende })

const im = (v: ReturnType<typeof vertrag>, von: string, bis: string) =>
  faelligkeitenIm(v, alsTag(von), alsTag(bis))

test('monatlich ohne billing_day: Tag-des-Monats aus start_date, Starttag zaehlt nicht', () => {
  // MySales Consulting, 1.190 EUR/Monat, start 23.06.2026, kein billing_day.
  assert.deepEqual(
    im(vertrag('2026-06-23', 'monthly', null), '2026-06-01', '2026-10-31'),
    ['2026-07-23', '2026-08-23', '2026-09-23', '2026-10-23'],
  )
})

test('monatlich mit billing_day vor dem Startdatum: erste Ausfuehrung im Folgemonat', () => {
  // Bausparer Tag 3, start 09.03.2026 -> der 03.03. liegt vor dem Start.
  // contract_executions: erste Ausfuehrung 2026-04-03.
  assert.deepEqual(
    im(vertrag('2026-03-09', 'monthly', 3), '2026-03-01', '2026-06-30'),
    ['2026-04-03', '2026-05-03', '2026-06-03'],
  )
})

test('monatlich mit billing_day nach dem Startdatum: erste Ausfuehrung im Startmonat', () => {
  // Bausparer Tag 15, start 09.03.2026. contract_executions: erste = 2026-03-15.
  assert.deepEqual(
    im(vertrag('2026-03-09', 'monthly', 15), '2026-03-01', '2026-05-31'),
    ['2026-03-15', '2026-04-15', '2026-05-15'],
  )
})

test('quartalsweise', () => {
  assert.deepEqual(
    im(vertrag('2026-01-15', 'quarterly', 1), '2026-01-01', '2026-12-31'),
    ['2026-04-01', '2026-07-01', '2026-10-01'],
  )
})

test('halbjaehrlich', () => {
  assert.deepEqual(
    im(vertrag('2026-02-01', 'biannual', 10), '2026-01-01', '2027-03-31'),
    ['2026-02-10', '2026-08-10', '2027-02-10'],
  )
})

test('jaehrlich', () => {
  assert.deepEqual(
    im(vertrag('2026-01-15', 'yearly', 1), '2026-01-01', '2028-12-31'),
    ['2027-01-01', '2028-01-01'],
  )
})

test('woechentlich und zweiwoechentlich rechnen in Tagen ab start_date', () => {
  assert.deepEqual(
    im(vertrag('2026-09-01', 'weekly', null), '2026-09-01', '2026-09-30'),
    ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
  )
  assert.deepEqual(
    im(vertrag('2026-09-01', 'biweekly', null), '2026-09-01', '2026-10-15'),
    ['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13'],
  )
})

test('end_date schneidet ab', () => {
  assert.deepEqual(
    im(vertrag('2026-06-23', 'monthly', null, '2026-09-30'), '2026-06-01', '2026-12-31'),
    ['2026-07-23', '2026-08-23', '2026-09-23'],
  )
})

test('Vertrag startet erst nach dem Fenster', () => {
  assert.deepEqual(im(vertrag('2027-01-05', 'monthly', 5), '2026-09-01', '2026-12-31'), [])
})

test('billing_day 31 ueberspringt kurze Monate', () => {
  // Kein Nachziehen auf den 30. — der Cron bucht dort ebenfalls nicht. Wenn das
  // fachlich falsch ist, muessen beide Seiten geaendert werden, nicht nur diese.
  assert.deepEqual(
    im(vertrag('2026-01-01', 'monthly', 31), '2026-03-01', '2026-07-31'),
    ['2026-03-31', '2026-05-31', '2026-07-31'],
  )
})

test('billing_day 29 trifft den 29.02. im Schaltjahr', () => {
  assert.deepEqual(
    im(vertrag('2028-01-01', 'monthly', 29), '2028-02-01', '2028-03-31'),
    ['2028-02-29', '2028-03-29'],
  )
})

test('unbekannte Frequenz faellt auf monatlich zurueck', () => {
  assert.deepEqual(
    im(vertrag('2026-09-01', 'irgendwas', 5), '2026-09-01', '2026-11-30'),
    ['2026-09-05', '2026-10-05', '2026-11-05'],
  )
})

test('ohne start_date gibt es keine Faelligkeit', () => {
  assert.deepEqual(
    faelligkeitenIm(
      { start_date: null, frequency: 'monthly', billing_day: 1, end_date: null },
      alsTag('2026-09-01'),
      alsTag('2026-12-31'),
    ),
    [],
  )
})
