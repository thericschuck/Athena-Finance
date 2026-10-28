import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireRows, KEINE_BERECHTIGUNG } from './mutation.ts'

const q = (data: { id: string }[] | null, error: { message: string } | null = null) => ({
  select: async () => ({ data, error }),
})

test('requireRows: Treffer ist Erfolg', async () => {
  assert.deepEqual(await requireRows(q([{ id: 'a' }])), { error: null, count: 1 })
})
test('requireRows: 0 Zeilen (RLS) ist ein Fehler', async () => {
  assert.deepEqual(await requireRows(q([])), { error: { message: KEINE_BERECHTIGUNG }, count: 0 })
  assert.deepEqual(await requireRows(q(null), 'Weg'), { error: { message: 'Weg' }, count: 0 })
})
test('requireRows: DB-Fehler wird durchgereicht', async () => {
  assert.deepEqual(await requireRows(q(null, { message: 'kaputt' })), { error: { message: 'kaputt' }, count: 0 })
})
