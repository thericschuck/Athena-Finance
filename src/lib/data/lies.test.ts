import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lies } from './lies.ts'

const antwort = <T>(data: T[] | null, error: { message: string } | null = null) =>
  Promise.resolve({ data, error })

test('lies: gibt die Zeilen zurueck', async () => {
  assert.deepEqual(await lies(antwort([{ id: 'a' }, { id: 'b' }]), 'accounts'), [{ id: 'a' }, { id: 'b' }])
})

test('lies: leeres Ergebnis ohne Fehler bleibt []', async () => {
  assert.deepEqual(await lies(antwort([]), 'accounts'), [])
})

test('lies: data null ohne Fehler wird zu []', async () => {
  assert.deepEqual(await lies(antwort<{ id: string }>(null), 'accounts'), [])
})

test('lies: wirft bei error, mit Namen und Meldung', async () => {
  await assert.rejects(lies(antwort(null, { message: 'permission denied' }), 'accounts'), {
    message: 'accounts: permission denied',
  })
})

test('lies: wirft auch, wenn trotz error Zeilen mitkommen (nie mit Teildaten weiterrechnen)', async () => {
  await assert.rejects(lies(antwort([{ id: 'a' }], { message: 'boom' }), 'x'), { message: 'x: boom' })
})
