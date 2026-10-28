import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geteiltAusForm, setzeGeteilt } from './teilen.ts'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

test('geteiltAusForm: ohne Schalter nichts aendern', () => {
  assert.equal(geteiltAusForm(fd({ name: 'x' })), undefined)
  assert.equal(geteiltAusForm(fd({ shared: 'on' })), undefined)
})

test('geteiltAusForm: Schalter vorhanden, Haken gesetzt/nicht gesetzt', () => {
  assert.equal(geteiltAusForm(fd({ shared_form: '1', shared: 'on' })), true)
  assert.equal(geteiltAusForm(fd({ shared_form: '1' })), false)
  assert.equal(geteiltAusForm(fd({ shared_form: '1', shared: 'nein' })), false)
})

/** Fake-Client: household_members liefert n Mitglieder, update(...).eq().eq() wird protokolliert. */
function fakeDb(mitglieder: number) {
  const log: string[] = []
  const db = {
    from: (t: string) => ({
      select: () => Promise.resolve({ data: Array.from({ length: mitglieder }, (_, i) => ({ user_id: `u${i}` })) }),
      update: (v: { shared: boolean }) => {
        const q = { eq: (c: string, x: string) => (log.push(`${t} shared=${v.shared} ${c}=${x}`), c === 'user_id' ? Promise.resolve({ error: null }) : q) }
        return q
      },
    }),
  }
  return { db: db as never, log }
}

test('setzeGeteilt valuables: nur eigene Zeile (user_id), Teilen braucht Mitglieder, Entzug immer', async () => {
  let f = fakeDb(2)
  assert.equal(await setzeGeteilt(f.db, 'valuables', 'v1', 'me', fd({ shared_form: '1', shared: 'on' })), null)
  assert.deepEqual(f.log, ['valuables shared=true id=v1', 'valuables shared=true user_id=me'])
  f = fakeDb(1)
  await setzeGeteilt(f.db, 'valuables', 'v1', 'me', fd({ shared_form: '1', shared: 'on' }))
  assert.deepEqual(f.log, [])
  f = fakeDb(1)
  await setzeGeteilt(f.db, 'valuables', 'v1', 'me', fd({ shared_form: '1' }))
  assert.deepEqual(f.log, ['valuables shared=false id=v1', 'valuables shared=false user_id=me'])
  f = fakeDb(2)
  await setzeGeteilt(f.db, 'valuables', 'v1', 'me', fd({ name: 'x' }))
  assert.deepEqual(f.log, [])
})
