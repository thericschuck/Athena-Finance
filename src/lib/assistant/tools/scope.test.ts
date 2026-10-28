import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScopeContext } from '../../haushalt/scope.ts'
import { scopeOwner, scopeKonten, scopeKontenTabelle, scopeIbans, scopeHaushaltsweit, scopeBeschreibung } from './scope.ts'

const ERIC = '11111111-1111-4111-8111-111111111111'
const MALIK = '22222222-2222-4222-8222-222222222222'
const H = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

/** Minimaler Query-Builder, der die Aufrufe protokolliert. */
function fake() {
  const calls: string[] = []
  const q = {
    eq: (c: string, v: string) => (calls.push(`eq ${c}=${v}`), q),
    in: (c: string, v: readonly string[]) => (calls.push(`in ${c}=[${v.join(',')}]`), q),
    or: (f: string) => (calls.push(`or ${f}`), q),
  }
  return { q, calls }
}

const konten = [
  { id: 'e1', user_id: ERIC, shared: false, bank_iban: 'DE01 1111' },
  { id: 'g1', user_id: ERIC, shared: true, bank_iban: 'DE09 9999' },
  { id: 'm1', user_id: MALIK, shared: false, bank_iban: 'DE05 5555' },
]
const solo = buildScopeContext({
  userId: ERIC, householdId: H, members: [{ id: ERIC, role: 'owner', joinedAt: '2026-01-01' }], accounts: konten.slice(0, 2),
})
const zu_zweit = (requested: string) => buildScopeContext({
  userId: ERIC, requested, householdId: H, accounts: konten,
  members: [{ id: ERIC, role: 'owner', joinedAt: '2026-01-01', name: 'Eric' }, { id: MALIK, role: 'member', joinedAt: '2026-02-01', name: 'Malik' }],
})

test('ohne Partner: exakt das alte user_id-Filter (Regression)', () => {
  for (const fn of [
    (q: ReturnType<typeof fake>['q']) => scopeOwner(q, solo),
    (q: ReturnType<typeof fake>['q']) => scopeOwner(q, solo, { sharedColumn: false }),
    (q: ReturnType<typeof fake>['q']) => scopeKonten(q, solo),
    (q: ReturnType<typeof fake>['q']) => scopeKontenTabelle(q, solo),
    (q: ReturnType<typeof fake>['q']) => scopeIbans(q, solo),
    (q: ReturnType<typeof fake>['q']) => scopeHaushaltsweit(q, solo),
  ]) {
    const { q, calls } = fake()
    fn(q)
    assert.deepEqual(calls, [`eq user_id=${ERIC}`])
  }
  assert.equal(scopeBeschreibung(solo), null)
})

test('mit Partner: Scope-Helfer, Besitzer immer auf Haushaltsmitglieder begrenzt', () => {
  const ich = zu_zweit('ich')
  let f = fake(); scopeOwner(f.q, ich)
  assert.deepEqual(f.calls, [`in user_id=[${ERIC},${MALIK}]`, `or user_id.in.(${ERIC}),and(shared.eq.true,user_id.in.(${ERIC},${MALIK}))`])
  f = fake(); scopeKonten(f.q, ich)
  assert.deepEqual(f.calls, ['in account_id=[e1,g1]'])
  f = fake(); scopeKontenTabelle(f.q, ich)
  assert.deepEqual(f.calls, ['in id=[e1,g1]'])

  const gem = zu_zweit('gemeinsam')
  f = fake(); scopeOwner(f.q, gem)
  assert.deepEqual(f.calls, [`in user_id=[${ERIC},${MALIK}]`, `in user_id=[${ERIC},${MALIK}]`])
  f = fake(); scopeKonten(f.q, gem)
  assert.deepEqual(f.calls, ['in account_id=[e1,g1,m1]'])
  // Service-Role: ohne Mitglieder-Filter waere der Test rot (kein RLS im Review-Lauf)
  for (const c of [ich, gem, zu_zweit('partner')]) {
    f = fake(); scopeHaushaltsweit(f.q, c)
    assert.deepEqual(f.calls, [`in user_id=[${ERIC},${MALIK}]`])
  }
  assert.match(scopeBeschreibung(gem) ?? '', /Gemeinsam/)
})
