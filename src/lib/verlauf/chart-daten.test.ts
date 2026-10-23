import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aenderung, baueZeilen, filterZeitraum, toepfeSchichten, zeitraumGrenze } from './chart-daten.ts'
import type { NetWorthPunkt } from './types.ts'

const p = (datum: string, extra: Partial<NetWorthPunkt> = {}): NetWorthPunkt => ({
  datum, net_worth: 100, total_assets: 100, total_checking: 100, total_investment: 0, total_savings: 0,
  total_cash: 0, total_depot: 0, total_crypto: 0, total_bausparer: 0, total_business: 0, total_debts: 0, ...extra,
})

test('Zeitraum behält den letzten Punkt vor der Grenze', () => {
  const heute = new Date('2026-10-23T12:00:00Z')
  const l = [p('2026-08-01'), p('2026-09-20'), p('2026-10-10')]
  assert.equal(zeitraumGrenze('1m', heute), '2026-09-23')
  assert.deepEqual(filterZeitraum(l, '1m', heute).map(x => x.datum), ['2026-09-20', '2026-10-10'])
  assert.equal(zeitraumGrenze('ytd', heute), '2026-01-01')
  assert.equal(filterZeitraum(l, 'max', heute).length, 3)
})

test('Änderung: Prozent nur bei positivem Start', () => {
  assert.equal(aenderung(100, 150).prozent, 50)
  assert.equal(aenderung(0, 150).prozent, null)
})

test('Töpfe: nur belegte, Rest als Weitere', () => {
  const l = [p('2026-01-01', { total_checking: 0, total_depot: 5 })]
  assert.deepEqual(toepfeSchichten(l).schichten.map(s => s.key), ['total_depot'])
  const viele = [p('2026-01-01', { total_checking: 1, total_investment: 2, total_savings: 3, total_cash: 4, total_depot: 5, total_crypto: 6 })]
  const r = toepfeSchichten(viele)
  assert.equal(r.schichten.length, 6)
  assert.equal(r.schichten[5].key, 'weitere')
  assert.equal(r.rest.size, 1)
})

test('Zeilen: Schulden negativ, Projektion schliesst an', () => {
  const z = baueZeilen([p('2026-01-01', { total_debts: 30 }), p('2026-01-02')], new Set(), [], [{ datum: '2026-02-01', wert: 120 }])
  assert.equal(z[0].schulden, -30)
  assert.equal(z[1].projektion, 100)
  assert.equal(z.length, 3)
})
