import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sumFlows, savingsRate, rollupByRoot, INCLUDE_ALL, INCLUDE_CONSUMPTION, UNCATEGORIZED, type FlowRow,
} from './flow-calc.ts'

const rows: FlowRow[] = [
  { flow_kind: 'echt',      income: 3000, expense: 0,   root_category_id: 'gehalt', root_category_name: 'Gehalt', category_id: 'schera', category_name: 'Schera GmbH' },
  { flow_kind: 'echt',      income: 0,    expense: 400, root_category_id: 'leben',  root_category_name: 'Lebenserhaltung', category_id: 'food', category_name: 'Lebensmittel' },
  { flow_kind: 'anlage',    income: 0,    expense: 500, root_category_id: 'anlage', root_category_name: 'Krypto', category_id: 'kraken', category_name: 'Kraken' },
  { flow_kind: 'forderung', income: 50,   expense: 100, root_category_id: 'schuld', root_category_name: 'Schulden', category_id: 'lent', category_name: 'Verliehen' },
]

test('sumFlows: alles mitzählen', () => {
  const t = sumFlows(rows, INCLUDE_ALL)
  assert.equal(t.income, 3050)
  assert.equal(t.expense, 1000)
  assert.equal(t.net, 2050)
})

test('sumFlows: ohne Anlage/Forderung bleibt nur echt, Aufschlüsselung bleibt vollständig', () => {
  const t = sumFlows(rows, INCLUDE_CONSUMPTION)
  assert.equal(t.income, 3000)
  assert.equal(t.expense, 400)
  assert.deepEqual(t.anlage, { income: 0, expense: 500 })
  assert.deepEqual(t.forderung, { income: 50, expense: 100 })
})

test('sumFlows: unbekannte Arten (umbuchung) zählen nie mit', () => {
  const t = sumFlows([{ flow_kind: 'umbuchung', income: 999, expense: 999 }], INCLUDE_ALL)
  assert.equal(t.income, 0)
  assert.equal(t.expense, 0)
})

test('sumFlows: numerische Strings aus PostgREST werden gelesen', () => {
  const t = sumFlows([{ flow_kind: 'echt', income: '10.50' as unknown as number, expense: 2 }], INCLUDE_ALL)
  assert.equal(t.income, 10.5)
})

test('Sparquote rechnet nur auf echt, unabhängig vom Schalter', () => {
  assert.equal(savingsRate(sumFlows(rows, INCLUDE_ALL)), 87)        // (3000-400)/3000
  assert.equal(savingsRate(sumFlows(rows, INCLUDE_CONSUMPTION)), 87)
})

test('Sparquote ohne Einnahmen ist null, nicht 0', () => {
  assert.equal(savingsRate(sumFlows([{ flow_kind: 'echt', income: 0, expense: 50 }])), null)
})

test('Sparquote darf negativ sein', () => {
  assert.equal(savingsRate(sumFlows([{ flow_kind: 'echt', income: 100, expense: 300 }])), -200)
})

test('rollupByRoot: Hauptkategorie mit Drilldown, größte zuerst', () => {
  const r = rollupByRoot([
    { flow_kind: 'echt', income: 0, expense: 10, root_category_id: 'l', root_category_name: 'Leben', category_id: 'a', category_name: 'A' },
    { flow_kind: 'echt', income: 0, expense: 30, root_category_id: 'l', root_category_name: 'Leben', category_id: 'b', category_name: 'B' },
    { flow_kind: 'echt', income: 0, expense: 5,  root_category_id: 'x', root_category_name: 'X',     category_id: 'x', category_name: 'X' },
  ])
  assert.deepEqual(r.map(c => [c.name, c.expense]), [['Leben', 40], ['X', 5]])
  assert.deepEqual(r[0].children.map(c => c.name), ['B', 'A'])
})

test('rollupByRoot: gleichnamige Kategorien unter verschiedenen Eltern bleiben getrennt', () => {
  const r = rollupByRoot([
    { flow_kind: 'echt', income: 0, expense: 10, root_category_id: 'p1', root_category_name: 'P1', category_id: 'c1', category_name: 'Tools' },
    { flow_kind: 'echt', income: 0, expense: 20, root_category_id: 'p2', root_category_name: 'P2', category_id: 'c2', category_name: 'Tools' },
  ])
  assert.equal(r.length, 2)
})

test('rollupByRoot: ohne Kategorie überall derselbe Name, Schalter blendet Anlage aus', () => {
  const r = rollupByRoot([
    { flow_kind: 'echt', income: 0, expense: 7 },
    { flow_kind: 'anlage', income: 0, expense: 99, root_category_id: 'k', root_category_name: 'Krypto' },
  ], INCLUDE_CONSUMPTION)
  assert.deepEqual(r.map(c => [c.name, c.expense]), [[UNCATEGORIZED, 7]])
})

test('rollupByRoot: Einnahmen-Sicht sortiert nach Einnahmen und lässt Nullzeilen weg', () => {
  const r = rollupByRoot([
    { flow_kind: 'echt', income: 5,  expense: 0, root_category_id: 'a', root_category_name: 'A' },
    { flow_kind: 'echt', income: 50, expense: 0, root_category_id: 'b', root_category_name: 'B' },
    { flow_kind: 'echt', income: 0,  expense: 9, root_category_id: 'c', root_category_name: 'C' },
  ], INCLUDE_ALL, 'income')
  assert.deepEqual(r.map(c => c.name), ['B', 'A'])
})

test('monthlySeries: je Monat summiert, aufsteigend, Sparquote auf echt', async () => {
  const { monthlySeries } = await import('./flow-calc.ts')
  const s = monthlySeries([
    { month: '2026-09-01', flow_kind: 'echt',   income: 100, expense: 0 },
    { month: '2026-08-01', flow_kind: 'echt',   income: 200, expense: 100 },
    { month: '2026-08-01', flow_kind: 'anlage', income: 0,   expense: 50 },
  ])
  assert.deepEqual(s.map(m => m.month), ['2026-08-01', '2026-09-01'])
  assert.equal(s[0].expense, 150)
  assert.equal(s[0].echt.expense, 100)
  assert.equal(s[0].savingsRate, 50)
  assert.equal(s[1].savingsRate, 100)
})

test('monthlyCategorySeries: Top-N Hauptkategorien, Rest als Sonstige, Anlage ausgeblendet', async () => {
  const { monthlyCategorySeries } = await import('./flow-calc.ts')
  const r = (month: string, root: string, expense: number, kind = 'echt') =>
    ({ month, flow_kind: kind, income: 0, expense, root_category_name: root })
  const s = monthlyCategorySeries([
    r('2026-08-01', 'A', 100), r('2026-08-01', 'B', 50), r('2026-09-01', 'C', 10), r('2026-09-01', 'D', 5),
    r('2026-09-01', 'Krypto', 999, 'anlage'),
  ], undefined, 2)
  assert.deepEqual(s.categories, ['A', 'B', 'Weitere'])
  assert.equal(s.otherKey, 'Weitere')
  assert.deepEqual(s.months[1].values, { Weitere: 15 })
})

test('includeFromParam: ohne Parameter gilt der Standard, "1" und "0" überschreiben ihn', async () => {
  const { includeFromParam, flowDefaultFrom, includeForDefault } = await import('./flow-calc.ts')
  // Standard "alle" (auch ohne Einstellung)
  assert.deepEqual(includeFromParam(null), INCLUDE_ALL)
  assert.deepEqual(includeFromParam(undefined), INCLUDE_ALL)
  assert.deepEqual(includeFromParam('true'), INCLUDE_ALL)
  assert.deepEqual(includeFromParam('0'), INCLUDE_CONSUMPTION)
  assert.deepEqual(includeFromParam('1'), INCLUDE_ALL)
  // Standard "konsum": ohne Parameter Konsum, "1" holt alles dazu
  assert.deepEqual(includeFromParam(null, 'konsum'), INCLUDE_CONSUMPTION)
  assert.deepEqual(includeFromParam('1', 'konsum'), INCLUDE_ALL)
  assert.deepEqual(includeFromParam('0', 'alle'), INCLUDE_CONSUMPTION)
  // Einstellung lesen: nur "konsum" ändert etwas, Müll fällt auf "alle"
  assert.equal(flowDefaultFrom('konsum'), 'konsum')
  for (const v of ['alle', undefined, null, 'quatsch', 5]) assert.equal(flowDefaultFrom(v), 'alle')
  assert.deepEqual(includeForDefault('konsum'), INCLUDE_CONSUMPTION)
  assert.deepEqual(includeForDefault('alle'), INCLUDE_ALL)
})

test('monthlySeries: Monat mit nur Anlage-Zeilen entfällt in der Konsum-Sicht', async () => {
  const { monthlySeries } = await import('./flow-calc.ts')
  const rows = [
    { month: '2026-08-01', flow_kind: 'echt',   income: 10, expense: 5 },
    { month: '2026-09-01', flow_kind: 'anlage', income: 0,  expense: 50 },
  ]
  assert.deepEqual(monthlySeries(rows, INCLUDE_CONSUMPTION).map(m => m.month), ['2026-08-01'])
  assert.deepEqual(monthlySeries(rows, INCLUDE_ALL).map(m => m.month), ['2026-08-01', '2026-09-01'])
})

test('monthlyCategorySeries: Sammelposten kollidiert nicht mit einer echten Kategorie "Weitere"', async () => {
  const { monthlyCategorySeries } = await import('./flow-calc.ts')
  const r = (root: string, expense: number) => ({ month: '2026-08-01', flow_kind: 'echt', income: 0, expense, root_category_name: root })
  const s = monthlyCategorySeries([r('Weitere', 100), r('B', 50), r('C', 5)], undefined, 2)
  assert.equal(new Set(s.categories).size, s.categories.length)
  assert.equal(s.categories[0], 'Weitere')
  assert.notEqual(s.otherKey, 'Weitere')
})

test('monthlyCategorySeries: Monate ohne Ausgaben bleiben auf der Achse', async () => {
  const { monthlyCategorySeries } = await import('./flow-calc.ts')
  const s = monthlyCategorySeries([
    { month: '2026-08-01', flow_kind: 'echt', income: 100, expense: 0 },
    { month: '2026-09-01', flow_kind: 'echt', income: 0, expense: 10, root_category_name: 'A' },
  ])
  assert.deepEqual(s.months.map(m => m.month), ['2026-08-01', '2026-09-01'])
})
