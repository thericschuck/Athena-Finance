import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueChartDaten, zeitpunkt, type ChartEingaben } from './chartdaten.ts'
import { monatsenden, type SnapshotZeile } from './verlauf.ts'

const snap = (d: string, nw: number, chk = 0, sav = 0, cash = 0): SnapshotZeile =>
  ({ snapshot_date: d, net_worth: nw, total_checking: chk, total_savings: sav, total_cash: cash })

test('Monatsenden: letzter Snapshot je abgeschlossenem Monat, laufender Monat fehlt, Liquidität = Giro+Spar+Bargeld', () => {
  const v = monatsenden([
    snap('2026-08-30', 100, 10, 5, 1), snap('2026-08-31', 110, 12, 5, 1), snap('2026-08-15', 90, 1, 1, 1),
    snap('2026-09-30', 200, 20, 0, 0),
    snap('2026-10-05', 999, 99, 0, 0), // laufender Monat
  ], '2026-10-21')
  assert.deepEqual(v.map(p => p.datum), ['2026-08-31', '2026-09-30'])
  assert.equal(v[0].liquiditaet, 18)
  assert.equal(v[0].vermoegen, 110)
})

test('Monatsenden: begrenzt auf die jüngsten Monate, ohne Daten leer', () => {
  const alle = Array.from({ length: 9 }, (_, i) => snap(`2026-0${i + 1}-28`, i))
  assert.equal(monatsenden(alle, '2026-12-05', 6).length, 6)
  assert.deepEqual(monatsenden([], '2026-10-21'), [])
})

const E: ChartEingaben = {
  heute: '2026-10-21',
  verlauf: [
    { datum: '2026-08-31', liquiditaet: 500, vermoegen: 10_000 },
    { datum: '2026-09-30', liquiditaet: 400, vermoegen: 10_500 },
  ],
  start: { liquiditaet: 359, vermoegen: 11_000 },
  szenario: [
    { month: '2026-10', liquiditaetEnde: 800, vermoegenEnde: 11_100 },
    { month: '2026-11', liquiditaetEnde: 1_150, vermoegenEnde: 11_300 },
  ],
  basis: [
    { month: '2026-10', liquiditaetEnde: 700, vermoegenEnde: 11_050 },
    { month: '2026-11', liquiditaetEnde: 900, vermoegenEnde: 11_200 },
  ],
  tiefpunkt: { betrag: 338, datum: '2026-10-26' },
  mitAnnahmen: false,
}

test('Chart: Rückblick durchgezogen, „heute" verbindet beide, Prognose gestrichelt ab heute', () => {
  const d = baueChartDaten(E)
  const l = d.liquiditaet
  assert.deepEqual(l.map(p => p.datum), ['2026-08-31', '2026-09-30', '2026-10-21', '2026-10-31', '2026-11-30'])
  // Rückblick nur „ist"
  assert.equal(l[0].ist, 500)
  assert.equal(l[0].szenario, undefined)
  // heute trägt beides mit demselben Wert -> nahtloser Anschluss
  assert.equal(l[2].ist, 359)
  assert.equal(l[2].szenario, 359)
  // Zukunft nur „szenario"
  assert.equal(l[3].ist, undefined)
  assert.equal(l[3].szenario, 800)
  assert.equal(d.heute, zeitpunkt('2026-10-21'))
})

test('Chart: ohne Annahmen keine Basis-Linie, mit Annahmen ab heute eine zweite', () => {
  assert.equal(baueChartDaten(E).liquiditaet.some(p => p.basis !== undefined), false)
  const mit = baueChartDaten({ ...E, mitAnnahmen: true })
  const heute = mit.liquiditaet.find(p => p.datum === '2026-10-21')!
  assert.equal(heute.basis, 359)
  assert.equal(mit.liquiditaet.at(-1)!.basis, 900)
  assert.equal(mit.vermoegen.at(-1)!.basis, 11_200)
})

test('Chart: Vermögen nutzt dieselben Zeitpunkte mit eigenen Werten', () => {
  const d = baueChartDaten(E)
  assert.equal(d.vermoegen[0].ist, 10_000)
  assert.equal(d.vermoegen.at(-1)!.szenario, 11_300)
})

test('Chart: am Monatsletzten fällt der Punkt Monatsende mit heute zusammen und kommt nicht doppelt vor', () => {
  const d = baueChartDaten({ ...E, heute: '2026-10-31' })
  assert.equal(d.liquiditaet.filter(p => p.datum === '2026-10-31').length, 1)
})

test('Chart: ohne Rückblick bleibt die Prognose; Monatsanfänge decken den Bereich ab; Tiefpunkt', () => {
  const d = baueChartDaten({ ...E, verlauf: [] })
  assert.equal(d.liquiditaet[0].datum, '2026-10-21')
  assert.deepEqual(d.monatsanfaenge, [zeitpunkt('2026-10-01'), zeitpunkt('2026-11-01')])
  assert.deepEqual(d.tiefpunkt, { t: zeitpunkt('2026-10-26'), wert: 338 })
})
