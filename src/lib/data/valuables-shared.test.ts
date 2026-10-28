import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valuablesSharedLive, valuablesViewDirekt, valuablesSpalten } from './valuables-shared.ts'
import { buildScopeContext } from '../haushalt/scope.ts'

const ERIC = '11111111-1111-4111-8111-111111111111'
const MALIK = '22222222-2222-4222-8222-222222222222'
const ctx = buildScopeContext({
  userId: ERIC, householdId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accounts: [],
  members: [{ id: ERIC, role: 'owner', joinedAt: '2026-01-01' }, { id: MALIK, role: 'member', joinedAt: '2026-02-01' }],
})

test('Schalter: nur der Wert "true" aktiviert', () => {
  assert.equal(valuablesSharedLive({}), false)
  assert.equal(valuablesSharedLive({ VALUABLES_SHARED_LIVE: '1' }), false)
  assert.equal(valuablesSharedLive({ VALUABLES_SHARED_LIVE: 'true' }), true)
})

test('Direktpfad: Legacy-String immer, ScopeContext nur mit Schalter', () => {
  assert.equal(valuablesViewDirekt(ERIC, false), true)
  assert.equal(valuablesViewDirekt(ctx, false), false)
  assert.equal(valuablesViewDirekt(ctx, true), true)
})

test('Spalten: shared nur mit Schalter, bisherige Spalten unveraendert', () => {
  assert.equal(valuablesSpalten('id, name', false), 'id, name')
  assert.equal(valuablesSpalten('id, name', true), 'id, name, shared')
})
