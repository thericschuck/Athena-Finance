import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueKategorien, vorperiodenFlows } from './kategorien.ts'
import type { BankFlowZeile, BankSeitenDaten } from './typen.ts'

const INCL = { anlage: true, forderung: true }
const flow = (
  month: string, root: string | null, expense: number,
  extra: Partial<BankFlowZeile> = {},
): BankFlowZeile => ({
  flow_kind: 'echt', income: 0, expense, month, account_id: 'a1',
  root_category_id: root, root_category_name: root ? `Kat ${root}` : null,
  category_id: root, category_name: root ? `Kat ${root}` : null,
  ...extra,
})

const basis = (extra: Partial<Pick<BankSeitenDaten, 'cutoff' | 'monat' | 'heute' | 'konto' | 'flowRows'>> = {}) => ({
  cutoff: '2026-05-23', monat: null, heute: '2026-10-23', konto: null,
  flowRows: [] as BankFlowZeile[],
  ...extra,
})

test('Vorperiode: 6M (Mai..Okt) -> die 6 Monate davor (Nov..Apr)', () => {
  const rows = ['2025-10-01', '2025-11-01', '2026-04-01', '2026-05-01'].map(m => flow(m, 'x', 1))
  const v = vorperiodenFlows(basis({ flowRows: rows }), { kontoAccountId: null })
  assert.deepEqual(v?.map(r => r.month), ['2025-11-01', '2026-04-01'])
})

test('Vorperiode: gewaehlter Monat -> Monat davor', () => {
  const rows = ['2026-02-01', '2026-03-01', '2026-04-01'].map(m => flow(m, 'x', 1))
  const v = vorperiodenFlows(basis({ monat: '2026-04', flowRows: rows }), { kontoAccountId: null })
  assert.deepEqual(v?.map(r => r.month), ['2026-03-01'])
})

test('Vorperiode: Zeitraum Alles oder zu kurze Historie -> null', () => {
  const rows = [flow('2026-02-01', 'x', 1), flow('2026-06-01', 'x', 1)]
  assert.equal(vorperiodenFlows(basis({ cutoff: null, flowRows: rows }), { kontoAccountId: null }), null)
  // Historie beginnt erst im Februar 2026, die Vorperiode haette im November 2025 begonnen.
  assert.equal(vorperiodenFlows(basis({ flowRows: rows }), { kontoAccountId: null }), null)
})

test('Vorperiode: Konto ueber account_id; ohne Verknuepfung null', () => {
  const rows = [flow('2025-11-01', 'x', 1, { account_id: 'a2' }), flow('2025-11-01', 'y', 1), flow('2026-05-01', 'y', 1)]
  const v = vorperiodenFlows(basis({ konto: 'DE01', flowRows: rows }), { kontoAccountId: 'a1' })
  assert.deepEqual(v?.map(r => r.root_category_id), ['y'])
  assert.equal(vorperiodenFlows(basis({ konto: 'DE01', flowRows: rows }), { kontoAccountId: null }), null)
})

test('Kategorien: Anteile, Sortierung, Top-N mit Weitere, Ohne Kategorie bleibt sichtbar', () => {
  const rows = [
    flow('2026-06-01', 'a', 100), flow('2026-06-01', 'b', 50), flow('2026-06-01', 'c', 30),
    flow('2026-06-01', 'd', 20), flow('2026-06-01', null, 5),
  ]
  const a = baueKategorien(rows, null, INCL, 'ausgaben', 2)
  assert.equal(a.total, 205)
  assert.equal(a.anzahl, 5)
  assert.deepEqual(a.zeilen.map(z => z.id), ['a', 'b', null])
  assert.deepEqual(a.weitere.map(z => z.id), ['c', 'd'])
  assert.equal(a.weitereBetrag, 50)
  assert.ok(a.zeilen[2].ohneKategorie)
  const summe = a.zeilen.reduce((s, z) => s + z.anteil, 0) + a.weitereBetrag / a.total
  assert.ok(Math.abs(summe - 1) < 1e-9)
  assert.equal(a.vorTotal, null)
  assert.equal(a.zeilen[0].deltaPct, null)
})

test('Kategorien: Delta zur Vorperiode, Einnahmen-Modus, Unterkategorien', () => {
  const rows = [
    flow('2026-06-01', 'a', 0, { income: 200, category_id: 'a1', category_name: 'Unter 1' }),
    flow('2026-06-01', 'a', 0, { income: 100 }),
  ]
  const vor = [flow('2026-05-01', 'a', 0, { income: 150 })]
  const e = baueKategorien(rows, vor, INCL, 'einnahmen')
  assert.equal(e.total, 300)
  assert.equal(e.vorTotal, 150)
  assert.equal(e.deltaPct, 1)
  assert.equal(e.zeilen[0].deltaPct, 1)
  assert.deepEqual(e.zeilen[0].kinder.map(k => [k.id, k.direkt, Math.round(k.anteil * 100)]), [['a1', false, 67], ['a', true, 33]])
  // Ausgaben-Modus sieht die Einnahmen nicht.
  assert.equal(baueKategorien(rows, vor, INCL, 'ausgaben').anzahl, 0)
})

test('Kategorien: Anlage-Schalter wirkt, neue Kategorie ohne Vorwert hat kein Delta', () => {
  const rows = [flow('2026-06-01', 'a', 10), flow('2026-06-01', 'n', 40, { flow_kind: 'anlage' })]
  const vor = [flow('2026-05-01', 'a', 10)]
  assert.equal(baueKategorien(rows, vor, { anlage: false, forderung: false }, 'ausgaben').total, 10)
  const alle = baueKategorien(rows, vor, INCL, 'ausgaben')
  const neu = alle.zeilen.find(z => z.id === 'n')
  assert.equal(neu?.vorBetrag, 0)
  assert.equal(neu?.deltaPct, null)
})
