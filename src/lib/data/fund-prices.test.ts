import { test } from 'node:test'
import assert from 'node:assert/strict'
import { speichereKursFallsNeu } from './fund-prices.ts'

function fake(error: { message: string } | null = null) {
  const log: { tabelle?: string; zeile?: unknown; opt?: unknown } = {}
  const db = { from(t: string) { log.tabelle = t; return { upsert: async (z: unknown, o: unknown) => { log.zeile = z; log.opt = o; return { error } } } } }
  return { db: db as unknown as Parameters<typeof speichereKursFallsNeu>[0], log }
}
const zeile = { isin: 'DE0008491051', fund_name: 'UniGlobal', price: 1, price_date: '2026-11-13', currency: 'EUR' }

test('Kurs wird nur eingefuegt, nie ueberschrieben (ignoreDuplicates = ON CONFLICT DO NOTHING)', async () => {
  const f = fake()
  assert.deepEqual(await speichereKursFallsNeu(f.db, zeile), { error: null })
  assert.equal(f.log.tabelle, 'fund_prices')
  assert.deepEqual(f.log.zeile, zeile)
  assert.deepEqual(f.log.opt, { onConflict: 'isin,price_date', ignoreDuplicates: true })
})

test('Fehler kommt als Meldung zurueck', async () => {
  assert.deepEqual(await speichereKursFallsNeu(fake({ message: 'denied' }).db, zeile), { error: 'denied' })
})
