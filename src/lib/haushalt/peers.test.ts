import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peerIdsAusZeilen, gruppiereNachHaushalt } from './peers.ts'

const z = [
  { household_id: 'h1', user_id: 'eric', joined_at: '2026-01-01' },
  { household_id: 'h1', user_id: 'malik', joined_at: '2026-02-01' },
  { household_id: 'h2', user_id: 'x', joined_at: '2026-01-01' },
]

test('peerIds: ohne Haushalt nur der Nutzer selbst', () => {
  assert.deepEqual(peerIdsAusZeilen([], 'eric'), ['eric'])
  assert.deepEqual(peerIdsAusZeilen(z, 'fremd'), ['fremd'])
})

test('peerIds: Nutzer zuerst, dann Peers, keine fremden Haushalte', () => {
  assert.deepEqual(peerIdsAusZeilen(z, 'malik'), ['malik', 'eric'])
  assert.deepEqual(peerIdsAusZeilen(z, 'eric'), ['eric', 'malik'])
})

test('gruppiere: Ein-Personen-Fall, jeder Nutzer eine Gruppe', () => {
  assert.deepEqual(gruppiereNachHaushalt(['a', 'b'], []), [['a'], ['b']])
})

test('gruppiere: Haushaltsmitglieder in einer Gruppe, Eingabereihenfolge bleibt', () => {
  assert.deepEqual(gruppiereNachHaushalt(['malik', 'x', 'eric'], z), [['malik', 'eric'], ['x']])
})
