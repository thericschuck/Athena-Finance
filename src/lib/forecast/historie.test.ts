import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueHistorie, typischerLohnTag, type FlowZeile } from './historie.ts'

const z = (month: string, flow_kind: string, income: number, expense: number, tax_role: string | null = null): FlowZeile =>
  ({ month, flow_kind, income, expense, tax_role })

test('Historie: laufender Monat fehlt, Anlage zählt nur in der Gesamtsicht, Lohn nur bei Rolle lohn', () => {
  const h = baueHistorie([
    z('2026-08-01', 'echt', 3000, 0, 'lohn'),
    z('2026-08-01', 'echt', 500, 2000),
    z('2026-08-01', 'anlage', 0, 300),
    z('2026-10-01', 'echt', 999, 999),   // laufender Monat: ausgeschlossen
  ], '2026-10-21')
  assert.equal(h.length, 1)
  assert.equal(h[0].month, '2026-08')
  assert.equal(h[0].einnahmen, 3500)
  assert.equal(h[0].ausgaben, 2300)
  assert.equal(h[0].ausgabenEcht, 2000)
  assert.equal(h[0].lohnNetto, 3000)
})

test('Historie: Lücken zwischen den Monaten mit Daten werden mit 0 gefüllt', () => {
  const h = baueHistorie([z('2026-05-01', 'echt', 100, 50), z('2026-08-01', 'echt', 200, 80)], '2026-10-21')
  assert.deepEqual(h.map(m => m.month), ['2026-05', '2026-06', '2026-07', '2026-08'])
  assert.equal(h[1].einnahmen, 0)
})

test('Historie: unbekannte Arten (umbuchung) zählen nicht, ohne Daten ist sie leer', () => {
  assert.deepEqual(baueHistorie([z('2026-08-01', 'umbuchung', 500, 500)], '2026-10-21'), [])
  assert.deepEqual(baueHistorie([], '2026-10-21'), [])
})

test('Historie: begrenzt auf die jüngsten Monate', () => {
  const zeilen = Array.from({ length: 10 }, (_, i) => z(`2026-0${i % 9 + 1}-01`, 'echt', 1, 1))
  assert.ok(baueHistorie(zeilen, '2026-12-05', 4).length <= 4)
})

test('Lohn-Tag: Median der Eingangstage', () => {
  assert.equal(typischerLohnTag(['2026-06-28', '2026-07-30', '2026-08-28']), 28)
  assert.equal(typischerLohnTag([]), null)
})
