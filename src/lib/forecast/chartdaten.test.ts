import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueChartDaten, zeitpunkt, type ChartEingaben, type PrognoseTagLite } from './chartdaten.ts'
import { tagesverlauf, type SnapshotZeile } from './verlauf.ts'

const snap = (d: string, nw: number, chk = 0, sav = 0, cash = 0): SnapshotZeile =>
  ({ snapshot_date: d, net_worth: nw, total_checking: chk, total_savings: sav, total_cash: cash })

test('Tagesverlauf: nur abgeschlossene Tage im Fenster, Liquidität = Giro+Spar+Bargeld, aufsteigend', () => {
  const v = tagesverlauf([
    snap('2026-10-19', 110, 12, 5, 1), snap('2026-10-18', 100, 10, 5, 1),
    snap('2026-10-21', 999, 99, 0, 0),    // heute: fehlt, dafür steht der Live-Wert
    snap('2026-01-01', 50, 5, 0, 0),      // außerhalb des Fensters
  ], '2026-10-21', 30)
  assert.deepEqual(v.map(p => p.datum), ['2026-10-18', '2026-10-19'])
  assert.equal(v[1].liquiditaet, 18)
  assert.equal(v[1].vermoegen, 110)
  assert.deepEqual(tagesverlauf([], '2026-10-21'), [])
})

const tag = (datum: string, liq: number, vm: number, spanne = 50): PrognoseTagLite => ({
  datum, liquiditaet: liq, liquiditaetUnten: liq - spanne, liquiditaetOben: liq + spanne,
  vermoegen: vm, vermoegenUnten: vm - spanne, vermoegenOben: vm + spanne,
})

const E: ChartEingaben = {
  heute: '2026-10-21',
  verlauf: [
    { datum: '2026-10-19', liquiditaet: 500, vermoegen: 10_000 },
    { datum: '2026-10-20', liquiditaet: 400, vermoegen: 10_500 },
  ],
  start: { liquiditaet: 359, vermoegen: 11_000 },
  szenario: [tag('2026-10-22', 400, 11_050), tag('2026-10-23', 450, 11_080, 90)],
  basis: [tag('2026-10-22', 380, 11_040), tag('2026-10-23', 420, 11_060)],
  tiefpunkt: { betrag: 338, datum: '2026-10-22' },
  mitAnnahmen: false,
}

test('Chart: Rückblick durchgezogen, „heute" verbindet beide, Prognose gestrichelt ab heute', () => {
  const l = baueChartDaten(E).liquiditaet
  assert.deepEqual(l.map(p => p.datum), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'])
  assert.equal(l[0].ist, 500)
  assert.equal(l[0].szenario, undefined)
  assert.equal(l[2].ist, 359)
  assert.equal(l[2].szenario, 359)
  assert.equal(l[3].ist, undefined)
  assert.equal(l[3].szenario, 400)
})

test('Chart: das Band beginnt bei heute mit Breite 0 und öffnet sich', () => {
  const l = baueChartDaten(E).liquiditaet
  assert.deepEqual(l[2].band, [359, 359])
  assert.deepEqual(l[3].band, [350, 450])
  assert.deepEqual(l[4].band, [360, 540])
  assert.equal(l[0].band, undefined)
})

test('Chart: ohne Annahmen keine Basis-Linie, mit Annahmen ab heute eine zweite', () => {
  assert.equal(baueChartDaten(E).liquiditaet.some(p => p.basis !== undefined), false)
  const mit = baueChartDaten({ ...E, mitAnnahmen: true })
  assert.equal(mit.liquiditaet.find(p => p.datum === '2026-10-21')!.basis, 359)
  assert.equal(mit.liquiditaet.at(-1)!.basis, 420)
  assert.equal(mit.vermoegen.at(-1)!.basis, 11_060)
})

test('Chart: Vermögen nutzt dieselben Zeitpunkte mit eigenen Werten und Bändern', () => {
  const d = baueChartDaten(E)
  assert.equal(d.vermoegen[0].ist, 10_000)
  assert.equal(d.vermoegen.at(-1)!.szenario, 11_080)
  assert.deepEqual(d.vermoegen.at(-1)!.band, [10_990, 11_170])
})

test('Chart: ein Prognosetag auf oder vor heute kommt nicht doppelt vor', () => {
  const d = baueChartDaten({ ...E, szenario: [tag('2026-10-21', 777, 1), ...E.szenario] })
  assert.equal(d.liquiditaet.filter(p => p.datum === '2026-10-21').length, 1)
  assert.equal(d.liquiditaet.find(p => p.datum === '2026-10-21')!.szenario, 359)
})

test('Chart: ohne Rückblick bleibt die Prognose; Monatsanfänge decken den Bereich ab; Tiefpunkt', () => {
  const d = baueChartDaten({ ...E, verlauf: [] })
  assert.equal(d.liquiditaet[0].datum, '2026-10-21')
  assert.deepEqual(d.monatsanfaenge, [zeitpunkt('2026-10-01')])
  assert.deepEqual(d.tiefpunkt, { t: zeitpunkt('2026-10-22'), wert: 338 })
  assert.equal(d.heute, zeitpunkt('2026-10-21'))
})
