import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScopeContext, hatPartner, parseScope, applyOwnerScope, applyAccountScope, umbuchungsArt, isOwnUmbuchung,
  isHouseholdOnlyUmbuchung, type ScopeAccountInput, type ScopeMemberInput,
} from './scope.ts'

const ERIC = '11111111-1111-4111-8111-111111111111'
const MALIK = '22222222-2222-4222-8222-222222222222'
const DRITTE = '33333333-3333-4333-8333-333333333333'
const H = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const acc = (id: string, user_id: string, iban: string | null, shared = false): ScopeAccountInput =>
  ({ id, user_id, shared, bank_iban: iban })
const member = (id: string, joinedAt: string, role = 'member', name: string | null = null): ScopeMemberInput =>
  ({ id, role, joinedAt, name })

const ericKonten = [
  acc('e1', ERIC, 'DE01 1111'), acc('e2', ERIC, 'DE02 2222'), acc('g1', ERIC, 'DE09 9999', true),
]

test('Eric allein: jeder Scope faellt auf ich, Konten wie user_id = u', () => {
  for (const requested of ['ich', 'partner', 'gemeinsam', null, undefined]) {
    const ctx = buildScopeContext({
      userId: ERIC, requested, householdId: H, members: [member(ERIC, '2026-01-01', 'owner')], accounts: ericKonten,
    })
    assert.equal(ctx.scope, 'ich')
    assert.deepEqual(ctx.available, ['ich'])
    assert.equal(ctx.partnerId, null)
    assert.deepEqual(ctx.ownerIds, [ERIC])
    assert.equal(ctx.includeShared, true)
    assert.deepEqual(ctx.accountIds, ['e1', 'e2', 'g1'])
    assert.deepEqual(ctx.sharedAccountIds, ['g1'])
    assert.deepEqual(ctx.ibans, ['DE011111', 'DE022222', 'DE099999'])
    assert.deepEqual(ctx.householdIbans, ctx.ibans)
  }
})

const zwei = (requested: string | null) => buildScopeContext({
  userId: ERIC, requested, householdId: H,
  members: [member(MALIK, '2026-03-01', 'member', 'Malik'), member(ERIC, '2026-01-01', 'owner', 'Eric')],
  accounts: [...ericKonten, acc('m1', MALIK, 'DE03 3333')],
})

test('Eric+Malik: ich zeigt eigene und geteilte Konten', () => {
  const c = zwei('ich')
  assert.deepEqual(c.available, ['ich', 'partner', 'gemeinsam'])
  assert.equal(c.partnerId, MALIK)
  assert.deepEqual(c.members.map(m => m.name), ['Eric', 'Malik'])
  assert.deepEqual(c.accountIds, ['e1', 'e2', 'g1'])
  assert.deepEqual(c.ownerIds, [ERIC])
  assert.equal(c.includeShared, true)
})

test('Eric+Malik: partner zeigt Maliks und geteilte Konten', () => {
  const c = zwei('partner')
  assert.equal(c.scope, 'partner')
  assert.deepEqual(c.accountIds, ['g1', 'm1'])
  assert.deepEqual(c.ownerIds, [MALIK])
  assert.equal(c.includeShared, true)
  assert.deepEqual(c.ibans, ['DE099999', 'DE033333'])
  assert.equal(c.householdIbans.length, 4)
})

test('Eric+Malik: gemeinsam zaehlt jedes Konto genau einmal', () => {
  const c = zwei('gemeinsam')
  assert.deepEqual([...c.accountIds].sort(), ['e1', 'e2', 'g1', 'm1'])
  assert.equal(new Set(c.accountIds).size, c.accountIds.length)
  assert.deepEqual(c.sharedAccountIds, ['g1'])
  assert.deepEqual(c.ownerIds, [ERIC, MALIK])
  assert.equal(c.includeShared, false)
  // Doppelt gelieferte Zeilen werden ebenfalls dedupliziert.
  const dup = buildScopeContext({
    userId: ERIC, requested: 'gemeinsam', householdId: H,
    members: [member(ERIC, '1'), member(MALIK, '2')],
    accounts: [...ericKonten, ...ericKonten],
  })
  assert.equal(dup.accountIds.length, 3)
})

test('Summe ich + partner minus geteilt = gemeinsam', () => {
  const ich = zwei('ich'), partner = zwei('partner'), gem = zwei('gemeinsam')
  const union = new Set([...ich.accountIds, ...partner.accountIds])
  assert.deepEqual([...union].sort(), [...gem.accountIds].sort())
})

test('Nutzer ohne Haushalt: nur ich, fremde Konten bleiben draussen', () => {
  const c = buildScopeContext({
    userId: DRITTE, requested: 'gemeinsam', householdId: null, members: [],
    accounts: [acc('d1', DRITTE, 'DE04 4444'), acc('e1', ERIC, 'DE01 1111')],
  })
  assert.equal(c.scope, 'ich')
  assert.deepEqual(c.available, ['ich'])
  assert.equal(c.householdId, null)
  assert.deepEqual(c.accountIds, ['d1'])
  assert.deepEqual(c.ownerIds, [DRITTE])
})

test('drei Mitglieder: Partner ist das erste andere Mitglied nach Beitritt, gemeinsam umfasst alle', () => {
  const c = buildScopeContext({
    userId: ERIC, requested: 'partner', householdId: H,
    members: [member(DRITTE, '2026-05-01'), member(MALIK, '2026-03-01'), member(ERIC, '2026-01-01', 'owner')],
    accounts: [...ericKonten, acc('m1', MALIK, 'DE03 3333'), acc('d1', DRITTE, 'DE04 4444')],
  })
  assert.equal(c.partnerId, MALIK)
  assert.deepEqual(c.accountIds, ['g1', 'm1'])
  const g = buildScopeContext({
    userId: ERIC, requested: 'gemeinsam', householdId: H,
    members: [member(DRITTE, '2026-05-01'), member(MALIK, '2026-03-01'), member(ERIC, '2026-01-01', 'owner')],
    accounts: [...ericKonten, acc('m1', MALIK, 'DE03 3333'), acc('d1', DRITTE, 'DE04 4444')],
  })
  assert.deepEqual(g.ownerIds, [ERIC, MALIK, DRITTE])
  assert.equal(g.accountIds.length, 5)
})

test('ungueltiger Scope-Parameter faellt auf ich', () => {
  for (const bad of ['', 'alle', 'ICH', '../x', 'partner,gemeinsam']) {
    assert.equal(zwei(bad).scope, 'ich')
  }
  assert.equal(parseScope(42), null)
  assert.equal(parseScope('partner'), 'partner')
})

type Rec = { calls: string[]; in: (c: string, v: readonly string[]) => Rec; or: (f: string) => Rec }
const rec = (): Rec => {
  const r: Rec = {
    calls: [],
    in(c, v) { r.calls.push(`in:${c}:${v.join(',')}`); return r },
    or(f) { r.calls.push(`or:${f}`); return r },
  }
  return r
}

test('applyOwnerScope: or() mit shared fuer ich/partner, in() fuer gemeinsam und ohne shared-Spalte', () => {
  const ich = applyOwnerScope(rec(), zwei('ich'), { sharedColumn: true })
  assert.deepEqual(ich.calls, [`or:user_id.in.(${ERIC}),and(shared.eq.true,user_id.in.(${ERIC},${MALIK}))`])
  const gem = applyOwnerScope(rec(), zwei('gemeinsam'), { sharedColumn: true })
  assert.deepEqual(gem.calls, [`in:user_id:${ERIC},${MALIK}`])
  const ohne = applyOwnerScope(rec(), zwei('partner'), { sharedColumn: false })
  assert.deepEqual(ohne.calls, [`in:user_id:${MALIK}`])
  const bad = applyOwnerScope(rec(), { ownerIds: ['x),shared.eq.true,(y'], includeShared: true })
  assert.deepEqual(bad.calls, ['or:user_id.in.(),and(shared.eq.true,user_id.in.())'])
})

test('applyOwnerScope: geteilte Zeilen nur von Haushaltsmitgliedern (Service-Role ohne RLS sieht keine fremden Haushalte)', () => {
  const eric = buildScopeContext({
    userId: ERIC, requested: 'ich', householdId: H, members: [member(ERIC, '2026-01-01', 'owner')], accounts: ericKonten,
  })
  const calls = applyOwnerScope(rec(), eric).calls
  assert.deepEqual(calls, [`or:user_id.in.(${ERIC}),and(shared.eq.true,user_id.in.(${ERIC}))`])
  assert.ok(!calls[0].includes(DRITTE))
  // ohne Haushalt (members leer): nur der Nutzer selbst
  const solo = buildScopeContext({ userId: ERIC, requested: 'ich', members: [], accounts: [] })
  assert.deepEqual(applyOwnerScope(rec(), solo).calls, [`or:user_id.in.(${ERIC}),and(shared.eq.true,user_id.in.(${ERIC}))`])
})

test('applyAccountScope filtert auf Scope-Konten', () => {
  assert.deepEqual(applyAccountScope(rec(), zwei('partner')).calls, ['in:account_id:g1,m1'])
  assert.deepEqual(applyAccountScope(rec(), zwei('ich'), 'konto_id').calls, ['in:konto_id:e1,e2,g1'])
})

test('Umbuchungen: intern im Scope, Haushalt ausserhalb, extern sonst', () => {
  const ich = zwei('ich'), gem = zwei('gemeinsam')
  assert.equal(umbuchungsArt('de03 3333', ich), 'haushalt') // Malik-Konto aus Sicht von Eric
  assert.equal(umbuchungsArt('DE03 3333', gem), 'intern')
  assert.equal(umbuchungsArt('DE09 9999', ich), 'intern') // geteiltes Konto ist in ich
  assert.equal(umbuchungsArt('DE99 0000', gem), 'extern')
  assert.equal(umbuchungsArt(null, gem), 'extern')
  assert.equal(isOwnUmbuchung('DE02 2222', ich), true)
  assert.equal(isHouseholdOnlyUmbuchung('DE03 3333', ich), true)
  assert.equal(isHouseholdOnlyUmbuchung('DE03 3333', gem), false)
})

test('hatPartner: eine Definition, deckungsgleich mit available.length > 1', () => {
  const allein = buildScopeContext({ userId: ERIC, requested: 'gemeinsam', householdId: H, members: [member(ERIC, '2026-01-01', 'owner')], accounts: ericKonten })
  const ohneHaushalt = buildScopeContext({ userId: ERIC, requested: 'ich', members: [], accounts: [] })
  for (const c of [allein, ohneHaushalt, zwei('ich'), zwei('partner'), zwei('gemeinsam')]) {
    assert.equal(hatPartner(c), c.available.length > 1)
  }
  assert.equal(hatPartner(allein), false)
  assert.equal(hatPartner(zwei('ich')), true)
})
