import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScopeContext } from '../haushalt/scope.ts'
import { nutztSnapshotFunktion } from './networth-reihe.ts'

const members = [{ id: 'eric', role: 'owner', joinedAt: '1' }, { id: 'malik', role: 'member', joinedAt: '2' }]
const ctx = (requested: string, shared: { owner: string } | null) =>
  buildScopeContext({
    userId: 'eric', requested, householdId: 'h', members,
    accounts: [
      { id: 'e1', user_id: 'eric', shared: false, bank_iban: null },
      { id: 'm1', user_id: 'malik', shared: false, bank_iban: null },
      ...(shared ? [{ id: 'g1', user_id: shared.owner, shared: true, bank_iban: null }] : []),
    ],
  })

test('Snapshot-Funktion: ich liest Snapshots, solange nur der Owner geteilte Konten besitzt', () => {
  assert.equal(nutztSnapshotFunktion(ctx('ich', { owner: 'eric' })), false)
  assert.equal(nutztSnapshotFunktion(ctx('ich', null)), false)
})
test('Snapshot-Funktion: partner und gemeinsam immer ueber die Funktion', () => {
  assert.equal(nutztSnapshotFunktion(ctx('partner', { owner: 'eric' })), true)
  assert.equal(nutztSnapshotFunktion(ctx('gemeinsam', null)), true)
})
test('Snapshot-Funktion: ich nutzt sie, sobald ein Peer ein geteiltes Konto besitzt', () => {
  assert.equal(nutztSnapshotFunktion(ctx('ich', { owner: 'malik' })), true)
})
