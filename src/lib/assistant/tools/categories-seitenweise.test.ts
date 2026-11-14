import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScopeContext } from '../../haushalt/scope.ts'
import { ladeBuchungenSeitenweise } from './buchungen-seitenweise.ts'

const ERIC = '11111111-1111-4111-8111-111111111111'
const ctx = buildScopeContext({
  userId: ERIC, householdId: null, members: [{ id: ERIC, role: 'owner', joinedAt: '2026-01-01' }],
  accounts: [{ id: 'e1', user_id: ERIC, shared: false, bank_iban: null }],
})

/** Minimaler Query-Builder: liefert `gesamt` Zeilen, ausgeschnitten nach `range`. Protokolliert die Bereiche. */
function fakeDb(gesamt: number, fehlerBeiSeite?: number) {
  const bereiche: [number, number][] = []
  const zeile = (i: number) => ({ id: `id-${i}`, category_id: i % 2 ? 'k1' : null, type: 'expense', amount: 1, date: '2026-01-01', description: null, merchant: null })
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'or', 'gte', 'order']) q[m] = () => q
      q.range = async (von: number, bis: number) => {
        bereiche.push([von, bis])
        if (fehlerBeiSeite !== undefined && bereiche.length - 1 === fehlerBeiSeite) return { data: null, error: { message: 'kaputt' } }
        return { data: Array.from({ length: Math.max(0, Math.min(bis + 1, gesamt) - von) }, (_, k) => zeile(von + k)), error: null }
      }
      return q
    },
  }
  return { db: db as never, bereiche }
}

test('Kategorien-Nutzung: mehr als 1.000 Buchungen werden vollstaendig geladen (frueher still abgeschnitten)', async () => {
  const { db, bereiche } = fakeDb(2500)
  const r = await ladeBuchungenSeitenweise(db, ctx, '2026-01-01')
  assert.equal(r.error, null)
  assert.equal(r.data?.length, 2500)
  assert.deepEqual(bereiche, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('Kategorien-Nutzung: genau 1.000 Buchungen kosten eine weitere (leere) Abfrage, weniger nur eine', async () => {
  const klein = fakeDb(30)
  assert.equal((await ladeBuchungenSeitenweise(klein.db, ctx, 'x')).data?.length, 30)
  assert.equal(klein.bereiche.length, 1)
  const genau = fakeDb(1000)
  assert.equal((await ladeBuchungenSeitenweise(genau.db, ctx, 'x')).data?.length, 1000)
  assert.equal(genau.bereiche.length, 2)
})

test('Kategorien-Nutzung: ein Fehler auf einer spaeteren Seite wird gemeldet statt verschluckt', async () => {
  const { db } = fakeDb(2500, 1)
  const r = await ladeBuchungenSeitenweise(db, ctx, 'x')
  assert.equal(r.data, null)
  assert.equal(r.error?.message, 'kaputt')
})
