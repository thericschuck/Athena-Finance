import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  heatFarbe, heatmapZeilen, jahresGruppen, kennzahlen, median, monatsIndex, seite, sparquote,
  vorjahresVergleich, type MonatRow,
} from './monate.ts'

const m = (month: string, income: number, expense: number, echtIn = income, echtEx = expense): MonatRow => ({
  month, income, expense, echt_income: echtIn, echt_expense: echtEx,
  anlage_income: 0, anlage_expense: 0, forderung_income: 0, forderung_expense: 0, tx_count: 1,
})

test('Sparquote rechnet auf Konsum und ist ohne Einnahmen null', () => {
  assert.equal(sparquote({ echt_income: 1000, echt_expense: 750 }), 25)
  assert.equal(sparquote({ echt_income: 1000, echt_expense: 1200 }), -20)
  assert.equal(sparquote({ echt_income: 0, echt_expense: 50 }), null)
})

test('Median: ungerade, gerade, leer', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), null)
})

test('Jahresgruppen: absteigend, Jahressumme und -quote', () => {
  const g = jahresGruppen([
    m('2025-12-01', 1000, 500), m('2026-01-01', 2000, 1000), m('2026-02-01', 1000, 1000),
  ])
  assert.deepEqual(g.map(x => x.jahr), [2026, 2025])
  assert.deepEqual(g[0].monate.map(x => x.month), ['2026-02-01', '2026-01-01'])
  assert.equal(g[0].summe.income, 3000)
  assert.equal(g[0].sparquote, 33)
  assert.equal(g[1].sparquote, 50)
})

test('Seite zaehlt Monate, Jahressumme bleibt die des ganzen Jahres', () => {
  const g = jahresGruppen([
    m('2025-12-01', 100, 0), m('2026-01-01', 100, 0), m('2026-02-01', 100, 0), m('2026-03-01', 100, 0),
  ])
  const s0 = seite(g, 0, 2)
  assert.deepEqual(s0.map(x => x.monate.length), [2])
  assert.equal(s0[0].summe.income, 300)
  const s1 = seite(g, 1, 2)
  assert.deepEqual(s1.map(x => [x.jahr, x.monate.length]), [[2026, 1], [2025, 1]])
  assert.deepEqual(seite(g, 5, 2), [])
})

test('Kennzahlen: Fenster, bester/schlechtester Monat, Median', () => {
  const rows = [
    m('2026-01-01', 1000, 500), // 50
    m('2026-02-01', 1000, 1100), // -10
    m('2026-03-01', 0, 300), // keine Quote
    m('2026-04-01', 1000, 900), // 10
  ]
  const k = kennzahlen(rows, 12, '2026-06-15')
  assert.equal(k.monate, 4)
  assert.deepEqual(k.bester, { month: '2026-01-01', wert: 50 })
  assert.deepEqual(k.schlechtester, { month: '2026-02-01', wert: -10 })
  assert.equal(k.medianKonsum, 700)
  // (3000 - 2800) / 3000 → 7
  assert.equal(k.durchschnittSparquote, 7)
})

test('Kennzahlen nutzen nur die juengsten 12 Monate', () => {
  const rows: MonatRow[] = []
  for (let i = 1; i <= 14; i++) rows.push(m(`${i <= 12 ? '2025' : '2026'}-${String(i <= 12 ? i : i - 12).padStart(2, '0')}-01`, 100, i <= 2 ? 0 : 50))
  const k = kennzahlen(rows, 12, '2026-03-15')
  assert.equal(k.monate, 12)
  // die beiden ältesten Monate (Quote 100 %) fallen heraus
  assert.equal(k.bester?.wert, 50)
})

test('Kennzahlen ohne Daten', () => {
  const k = kennzahlen([])
  assert.equal(k.monate, 0)
  assert.equal(k.durchschnittSparquote, null)
  assert.equal(k.bester, null)
  assert.equal(k.medianKonsum, null)
})

test('Vorjahresvergleich nur wenn der Vorjahresmonat existiert', () => {
  const rows = [m('2025-03-01', 1000, 800), m('2026-03-01', 1200, 600), m('2026-04-01', 1, 1)]
  const idx = monatsIndex(rows)
  const v = vorjahresVergleich(idx, rows[1])
  assert.ok(v)
  assert.equal(v.income, 200)
  assert.equal(v.expense, -200)
  assert.equal(v.incomePct, 20)
  assert.equal(v.expensePct, -25)
  assert.equal(vorjahresVergleich(idx, rows[2]), null)
  assert.equal(vorjahresVergleich(idx, rows[0]), null)
})

test('Vorjahresvergleich: Prozent null bei Vorjahreswert 0', () => {
  const rows = [m('2025-03-01', 0, 0), m('2026-03-01', 100, 50)]
  const v = vorjahresVergleich(monatsIndex(rows), rows[1])
  assert.equal(v?.incomePct, null)
  assert.equal(v?.expensePct, null)
})

test('Heatmap: Jahre absteigend, fehlende Monate und Monate ohne Einnahmen sind null', () => {
  const z = heatmapZeilen([m('2025-01-01', 1000, 900), m('2026-02-01', 1000, 500), m('2026-03-01', 0, 20)])
  assert.deepEqual(z.map(x => x.jahr), [2026, 2025])
  assert.equal(z[0].quoten[0], null)
  assert.equal(z[0].quoten[1], 50)
  assert.equal(z[0].quoten[2], null)
  assert.equal(z[1].quoten[0], 10)
  assert.equal(z[1].quoten.length, 12)
})

test('heatFarbe: Vorzeichen, Deckelung, neutral bei 0', () => {
  assert.equal(heatFarbe(0), null)
  assert.equal(heatFarbe(10)?.token, 'success')
  assert.equal(heatFarbe(-10)?.token, 'danger')
  assert.equal(heatFarbe(50)?.alpha, heatFarbe(90)?.alpha)
  assert.ok((heatFarbe(40)?.alpha ?? 0) > (heatFarbe(10)?.alpha ?? 1))
})
