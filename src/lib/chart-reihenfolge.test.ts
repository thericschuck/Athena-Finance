import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anzeigeReihenfolge, tooltipSortierer } from './chart-reihenfolge.ts'

test('Anzeigereihenfolge dreht den Stapel um (oben zuerst)', () => {
  assert.deepEqual(anzeigeReihenfolge(['unten', 'mitte', 'oben']), ['oben', 'mitte', 'unten'])
})

test('Tooltip sortiert nach dataKey oder Name, Unbekanntes kommt zuletzt', () => {
  const sort = tooltipSortierer(['oben', 'mitte', 'unten'])
  const items = [{ dataKey: 'unten' }, { dataKey: 'prognose' }, { name: 'oben' }, { dataKey: 'mitte' }]
  const sortiert = [...items].sort((a, b) => sort(a) - sort(b))
  assert.deepEqual(sortiert.map(i => ('dataKey' in i ? i.dataKey : i.name)), ['oben', 'mitte', 'unten', 'prognose'])
})
