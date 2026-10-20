import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthPeriod, yearPeriod } from './build.ts'

test('monthPeriod: normaler Monat', () => {
  const p = monthPeriod(2026, 4)
  assert.equal(p.type, 'monthly')
  assert.equal(p.periodStart, '2026-04-01')
  assert.equal(p.periodEnd, '2026-04-30')
  assert.equal(p.label, 'April 2026')
  assert.equal(p.previousPeriodStart, '2026-03-01')
  assert.equal(p.previousPeriodEnd, '2026-03-31')
  assert.equal(p.previousLabel, 'März 2026')
})

test('monthPeriod: Januar greift aufs Vorjahr zurueck', () => {
  const p = monthPeriod(2026, 1)
  assert.equal(p.previousPeriodStart, '2025-12-01')
  assert.equal(p.previousPeriodEnd, '2025-12-31')
  assert.equal(p.previousLabel, 'Dezember 2025')
})

test('monthPeriod: Dezember endet am 31.', () => {
  const p = monthPeriod(2026, 12)
  assert.equal(p.periodEnd, '2026-12-31')
  assert.equal(p.previousPeriodEnd, '2026-11-30')
})

test('monthPeriod: Schaltjahr-Februar', () => {
  assert.equal(monthPeriod(2024, 2).periodEnd, '2024-02-29')
  assert.equal(monthPeriod(2025, 2).periodEnd, '2025-02-28')
  assert.equal(monthPeriod(2100, 2).periodEnd, '2100-02-28')
  assert.equal(monthPeriod(2024, 3).previousPeriodEnd, '2024-02-29')
})

test('monthPeriod: unabhaengig von der Prozess-Zeitzone (UTC-Rechnung)', () => {
  const old = process.env.TZ
  try {
    process.env.TZ = 'Pacific/Auckland'
    assert.equal(monthPeriod(2026, 3).periodStart, '2026-03-01')
    process.env.TZ = 'America/Los_Angeles'
    assert.equal(monthPeriod(2026, 3).periodEnd, '2026-03-31')
  } finally {
    if (old === undefined) delete process.env.TZ
    else process.env.TZ = old
  }
})

test('yearPeriod', () => {
  const p = yearPeriod(2026)
  assert.equal(p.type, 'annual')
  assert.equal(p.periodStart, '2026-01-01')
  assert.equal(p.periodEnd, '2026-12-31')
  assert.equal(p.previousPeriodStart, '2025-01-01')
  assert.equal(p.previousLabel, '2025')
})

test('monthPeriod: ungueltige Eingaben werfen RangeError', () => {
  const bad: [number, number][] = [[2026, 0], [2026, 13], [2026, -1], [2026, 1.5], [2026, NaN], [NaN, 3], [2026.5, 3], [Infinity, 3]]
  for (const [y, m] of bad) assert.throws(() => monthPeriod(y, m), RangeError, `${y}-${m}`)
  assert.doesNotThrow(() => monthPeriod(2026, 1))
  assert.doesNotThrow(() => monthPeriod(2026, 12))
})
