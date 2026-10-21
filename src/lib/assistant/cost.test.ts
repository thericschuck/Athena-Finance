import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateCostUsd } from './cost.ts'

test('Kosten ohne Cache-Angaben: Eingabe und Ausgabe zum Listenpreis', () => {
  // Sonnet 5: 3 $ / 15 $ je Million
  assert.equal(estimateCostUsd('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 100_000 }), 4.5)
  assert.equal(estimateCostUsd('unbekannt', { inputTokens: 5, outputTokens: 5 }), null)
  assert.equal(estimateCostUsd('claude-sonnet-5', { inputTokens: 0, outputTokens: 0 }), null)
})

test('Kosten mit Cache: Lesen 0,1x, Schreiben 1,25x, Rest normal', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 0, inputTokenDetails: { cacheReadTokens: 800_000, cacheWriteTokens: 100_000, noCacheTokens: 100_000 } }
  // 100k normal (0,3) + 800k gelesen (0,24) + 100k geschrieben (0,375) = 0,915
  assert.ok(Math.abs((estimateCostUsd('claude-sonnet-5', usage) ?? 0) - 0.915) < 1e-9)
})
