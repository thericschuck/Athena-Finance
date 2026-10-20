import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAverageCostBasis, type NormalizedTrade } from './cost-basis.ts'

const t = (code: string, type: 'buy' | 'sell', volume: number, costEur: number, time: number): NormalizedTrade =>
  ({ code, type, volume, costEur, time })

test('leere Eingabe ergibt leere Map', () => {
  assert.equal(computeAverageCostBasis([]).size, 0)
})

test('ein Kauf: Durchschnitt = Gesamtkosten / Menge', () => {
  const r = computeAverageCostBasis([t('XXBT', 'buy', 2, 100, 1)])
  assert.equal(r.get('XXBT'), 50)
})

test('zwei Kaeufe: volumengewichteter Durchschnitt', () => {
  const r = computeAverageCostBasis([t('XETH', 'buy', 1, 100, 1), t('XETH', 'buy', 3, 600, 2)])
  assert.equal(r.get('XETH'), 175)
})

test('Verkauf laesst den Durchschnitt der Restmenge unveraendert', () => {
  const r = computeAverageCostBasis([t('XETH', 'buy', 2, 200, 1), t('XETH', 'sell', 1, 500, 2)])
  assert.equal(r.get('XETH'), 100)
})

test('vollstaendig verkauft ergibt null', () => {
  const r = computeAverageCostBasis([t('XETH', 'buy', 2, 200, 1), t('XETH', 'sell', 2, 500, 2)])
  assert.equal(r.get('XETH'), null)
})

test('Ueberverkauf klemmt Menge auf 0 (kein negativer Bestand)', () => {
  const r = computeAverageCostBasis([t('SOL', 'buy', 1, 10, 1), t('SOL', 'sell', 5, 50, 2)])
  assert.equal(r.get('SOL'), null)
})

test('Trades werden nach Zeit sortiert, nicht nach Eingabereihenfolge', () => {
  const r = computeAverageCostBasis([t('SOL', 'sell', 1, 0, 3), t('SOL', 'buy', 2, 20, 1), t('SOL', 'buy', 2, 60, 2)])
  assert.equal(r.get('SOL'), 20) // (20+60)/4
})

test('Wiedereinstieg nach Totalverkauf startet frisch', () => {
  const r = computeAverageCostBasis([
    t('SOL', 'buy', 1, 10, 1), t('SOL', 'sell', 1, 99, 2), t('SOL', 'buy', 1, 40, 3),
  ])
  assert.equal(r.get('SOL'), 40)
})

test('Assets werden getrennt gerechnet; Eingabe wird nicht mutiert', () => {
  const input = [t('A', 'buy', 1, 10, 2), t('B', 'buy', 1, 20, 1), t('A', 'buy', 1, 30, 1)]
  const copy = JSON.stringify(input)
  const r = computeAverageCostBasis(input)
  assert.equal(r.get('A'), 20)
  assert.equal(r.get('B'), 20)
  assert.equal(JSON.stringify(input), copy)
})
