import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFlowTransactions, getFlowTransactionsFuerNutzer, getMonthlyFlows } from './flows.ts'
import { buildScopeContext } from '../haushalt/scope.ts'

/** Fake-Query-Builder: zeichnet jeden Filteraufruf auf, liefert am Ende eine leere Seite. */
function fakeClient() {
  const calls: string[] = []
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...a: unknown[]) => {
    calls.push(`${name}(${a.map(x => (Array.isArray(x) ? `[${x.join(',')}]` : String(x))).join(',')})`)
    return b
  }
  for (const n of ['select', 'eq', 'in', 'or', 'gte', 'lte', 'order']) b[n] = chain(n)
  b.range = (...a: unknown[]) => { calls.push(`range(${a.join(',')})`); return Promise.resolve({ data: [], error: null }) }
  return { client: { from: (t: string) => { calls.push(`from(${t})`); return b } } as never, calls }
}

const ERIC = '11111111-1111-4111-8111-111111111111'
const MALIK = '22222222-2222-4222-8222-222222222222'
const filter = (calls: string[]) => calls.filter(c => /^(eq|in|or)\(/.test(c) && !c.startsWith('in(flow_kind') && !c.startsWith('in(type'))

test('owner-only (Reports): nur user_id = userId, kein Konten-/Peer-/or-Filter (identisch zum frueheren String-Pfad)', async () => {
  const f = fakeClient()
  await getFlowTransactionsFuerNutzer(f.client, ERIC, { from: '2026-01-01', to: '2026-01-31' })
  assert.deepEqual(filter(f.calls), [`eq(user_id,${ERIC})`, 'eq(counts_in_flow,true)'])
  assert.ok(!f.calls.some(c => c.startsWith('or(') || c.startsWith('in(account_id')))
  assert.ok(f.calls.includes('from(unified_transactions)'))
})

test('owner-only mit expliziter Kontenauswahl: user_id UND diese Konten', async () => {
  const f = fakeClient()
  await getFlowTransactionsFuerNutzer(f.client, ERIC, { accountIds: ['a1'] })
  assert.deepEqual(filter(f.calls), [`eq(user_id,${ERIC})`, 'in(account_id,[a1])', 'eq(counts_in_flow,true)'])
})

test('Scope-Pfad: Konten im Scope, kein user_id-Filter; Kontenauswahl wird auf den Scope geschnitten', async () => {
  const ctx = buildScopeContext({
    userId: ERIC, requested: 'ich', householdId: 'h',
    members: [{ id: ERIC, role: 'owner', joinedAt: '2026-01-01' }, { id: MALIK, role: 'member', joinedAt: '2026-02-01' }],
    accounts: [
      { id: 'e1', user_id: ERIC, shared: false, bank_iban: null },
      { id: 'm1', user_id: MALIK, shared: false, bank_iban: null },
    ],
  })
  let f = fakeClient()
  await getFlowTransactions(f.client, ctx)
  assert.deepEqual(filter(f.calls), ['in(account_id,[e1])', 'eq(counts_in_flow,true)'])
  f = fakeClient()
  await getFlowTransactions(f.client, ctx, { accountIds: ['e1', 'm1'] })
  assert.deepEqual(filter(f.calls), ['in(account_id,[e1])', 'eq(counts_in_flow,true)'])
  f = fakeClient()
  await getMonthlyFlows(f.client, ctx)
  assert.ok(f.calls.includes('from(monthly_flows)') && f.calls.includes('in(account_id,[e1])'))
})
