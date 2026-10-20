import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAccountBalances, computeMonthTotals, computeLiveBuckets, computeUpcomingRenewals,
  toMonthly, buildCryptoPortfolio, computeInventory, type ContractRow,
} from './dashboard-calc.ts'

test('Kontostand: Summe aus DB, Bankstand gewinnt', () => {
  const bal = computeAccountBalances(
    [{ id: 'a', bank_iban: null }, { id: 'b', bank_iban: 'DE1' }],
    [
      { account_id: 'a', balance: 70 },
      { account_id: 'b', balance: 5 },
    ],
    new Map([['DE1', 1544.57]]),
  )
  assert.equal(bal.get('a'), 70)
  assert.equal(bal.get('b'), 1544.57)
})

test('Monatssummen', () => {
  assert.deepEqual(
    computeMonthTotals([{ type: 'income', amount: 10 }, { type: 'expense', amount: 4 }, { type: 'transfer', amount: 9 }]),
    { income: 10, expense: 4, net: 6 },
  )
})

test('Live-Buckets: cash+other zusammen, unbekannter Typ ignoriert', () => {
  const b = computeLiveBuckets(
    [{ id: '1', type: 'cash' }, { id: '2', type: 'other' }, { id: '3', type: 'credit' }, { id: '4', type: 'x' }],
    new Map([['1', 10], ['2', 5], ['3', -20], ['4', 99]]),
  )
  assert.equal(b.cash, 15)
  assert.equal(b.debts, -20)
})

test('toMonthly', () => {
  assert.equal(toMonthly(12, 'yearly'), 1)
  assert.equal(toMonthly(10, 'unbekannt'), 10)
})

test('Vertragsfristen: auto-renew rollt vor, Sortierung nach Tagen', () => {
  const today = new Date(2026, 5, 15)
  const base: ContractRow = {
    id: 'x', name: 'X', provider: null, frequency: 'yearly', amount: 1, currency: 'EUR',
    end_date: '2025-06-30', notice_days: 14, auto_renews: true, account_id: null,
  }
  const res = computeUpcomingRenewals([
    base,
    { ...base, id: 'y', auto_renews: false },
    { ...base, id: 'z', end_date: '2026-06-20', notice_days: 0 },
  ], today)
  assert.deepEqual(res.map(r => r.id), ['x', 'z'])
})

test('Krypto-Portfolio: erste (neueste) Bewertung gewinnt', () => {
  const r = buildCryptoPortfolio(
    [{ id: 'a', quantity: 2, avg_buy_price: 10 }],
    [{ asset_id: 'a', price_per_unit: 5, total_value: 10 }, { asset_id: 'a', price_per_unit: 1, total_value: 2 }],
  )
  assert.equal(r.total, 10)
  assert.equal(r.totalCost, 20)
})

test('Inventar: im_vermoegen=false zählt nicht in den Wert', () => {
  assert.deepEqual(
    computeInventory([
      { aktueller_wert: 100, im_vermoegen: true },
      { aktueller_wert: 50, im_vermoegen: false },
      { aktueller_wert: null, im_vermoegen: null },
    ]),
    { wert: 100, stueck: 3 },
  )
})
