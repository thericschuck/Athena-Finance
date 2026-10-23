import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodCutoff } from './period.ts'

const am = (s: string) => new Date(`${s}T12:00:00`)

test('periodCutoff kappt aufs Monatsende statt in den Folgemonat zu laufen', () => {
  assert.equal(periodCutoff('3M', am('2026-05-31')), '2026-02-28')
  assert.equal(periodCutoff('1M', am('2026-03-31')), '2026-02-28')
  assert.equal(periodCutoff('6M', am('2026-08-31')), '2026-02-28')
  assert.equal(periodCutoff('1J', am('2024-02-29')), '2023-02-28')
})

test('periodCutoff: gewoehnliche Tage bleiben gleich, Alles hat keine Grenze', () => {
  assert.equal(periodCutoff('3M', am('2026-10-23')), '2026-07-23')
  assert.equal(periodCutoff('1J', am('2026-10-23')), '2025-10-23')
  assert.equal(periodCutoff('1W', am('2026-10-23')), '2026-10-16')
  assert.equal(periodCutoff('Alles', am('2026-10-23')), null)
})
