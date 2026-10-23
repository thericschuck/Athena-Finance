import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FlowTransaction } from '../data/flows.ts'
import { gegenparteien, monatsAchse, parteiVon } from './gegenparteien.ts'

let n = 0
function tx(p: Partial<FlowTransaction>): FlowTransaction {
  n += 1
  return {
    id: `t${n}`, date: '2026-10-01', type: 'expense', amount: 10, flow_kind: 'echt', source: 'bank_sync',
    account_id: 'k1', category_id: null, category_name: null, root_category_id: null,
    root_category_name: null, description: null, merchant: null, tax_role: null,
    ...p,
  }
}

test('parteiVon: Haendler, sonst Kurztext, sonst Unbekannt', () => {
  assert.equal(parteiVon({ merchant: ' REWE  Markt ', description: 'x' }), 'REWE Markt')
  assert.equal(parteiVon({ merchant: null, description: 'Kartenzahlung Bäckerei' }), 'Kartenzahlung Bäckerei')
  assert.equal(parteiVon({ merchant: null, description: 'a'.repeat(60) }), `${'a'.repeat(40)} …`)
  assert.equal(parteiVon({ merchant: '', description: null }), 'Unbekannt')
})

test('gegenparteien: Richtung, Schreibweisen zusammenfassen, Anteil und Schnitt', () => {
  const l = [
    tx({ merchant: 'REWE', amount: 30, date: '2026-09-03' }),
    tx({ merchant: 'rewe', amount: 10, date: '2026-10-03' }),
    tx({ merchant: 'REWE', amount: 20, date: '2026-10-09' }),
    tx({ merchant: 'Lidl', amount: 40 }),
    tx({ merchant: 'Arbeitgeber', type: 'income', amount: 2000 }),
  ]
  const a = gegenparteien(l, 'ausgaben')
  assert.equal(a.gesamt, 100)
  assert.equal(a.gesamtAnzahl, 4)
  assert.equal(a.zeilen.length, 2)
  assert.equal(a.zeilen[0].name, 'REWE') // haeufigste Schreibweise
  assert.equal(a.zeilen[0].summe, 60)
  assert.equal(a.zeilen[0].anzahl, 3)
  assert.equal(a.zeilen[0].schnitt, 20)
  assert.equal(a.zeilen[0].anteil, 0.6)
  assert.deepEqual(a.zeilen[0].monate, { '2026-09': 30, '2026-10': 30 })
  const e = gegenparteien(l, 'einnahmen')
  assert.deepEqual(e.zeilen.map(z => z.name), ['Arbeitgeber'])
})

test('gegenparteien: Top N und „Weitere"', () => {
  const l = Array.from({ length: 5 }, (_, i) => tx({ merchant: `P${i}`, amount: 10 * (i + 1) }))
  const a = gegenparteien(l, 'ausgaben', 3)
  assert.deepEqual(a.zeilen.map(z => z.name), ['P4', 'P3', 'P2'])
  assert.equal(a.weitere?.anzahlParteien, 2)
  assert.equal(a.weitere?.summe, 30)
  assert.equal(gegenparteien(l, 'ausgaben', 10).weitere, null)
  assert.equal(gegenparteien([], 'ausgaben').gesamt, 0)
})

test('monatsAchse: lueckenlos, hoechstens max, leer ohne Daten', () => {
  const z: { monate: Record<string, number> }[] = [{ monate: { '2026-01': 1, '2026-04': 2 } }, { monate: { '2026-03': 5 } }]
  assert.deepEqual(monatsAchse(z), ['2026-01', '2026-02', '2026-03', '2026-04'])
  assert.deepEqual(monatsAchse(z, 2), ['2026-03', '2026-04'])
  assert.deepEqual(monatsAchse([{ monate: { '2025-11': 1, '2026-02': 1 } }]), ['2025-11', '2025-12', '2026-01', '2026-02'])
  assert.deepEqual(monatsAchse([]), [])
})
