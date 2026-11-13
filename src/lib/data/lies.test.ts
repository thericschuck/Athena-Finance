import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lies } from './lies.ts'

type Fehler = { message: string; details?: string | null; code?: string | null; cause?: unknown }

const antwort = <T>(data: T[] | null, error: Fehler | null = null) =>
  Promise.resolve({ data, error })

/** Abfrage, deren n-tes `await` die n-te Antwort liefert (wie ein postgrest-Builder, der pro `then()` neu anfragt). */
function abfolge<T>(antworten: { data: T[] | null; error: Fehler | null }[]) {
  const zaehler = { aufrufe: 0 }
  const query = {
    then<R>(ok: (v: { data: T[] | null; error: Fehler | null }) => R) {
      const a = antworten[Math.min(zaehler.aufrufe, antworten.length - 1)]
      zaehler.aufrufe++
      return Promise.resolve(a).then(ok)
    },
  }
  return { query: query as PromiseLike<{ data: T[] | null; error: Fehler | null }>, zaehler }
}

const NETZFEHLER: Fehler = {
  message: 'TypeError: fetch failed',
  details: 'TypeError: fetch failed\n\nCaused by: Error: read ECONNRESET (ECONNRESET)\n    at TCP.onStreamRead',
  code: '',
}
const OHNE_WARTEN = { wartezeitMs: 0 }

// ── bisherige Tests (unveraendert) ──

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

// ── Ursache (Caused by) ──

test('lies: haengt bei Netzfehlern die Ursache aus error.details an, sonst nichts aus details', async () => {
  await assert.rejects(lies(antwort(null, NETZFEHLER), 'accounts', OHNE_WARTEN), {
    message: 'accounts: TypeError: fetch failed (Caused by: Error: read ECONNRESET (ECONNRESET))',
  })
  // normale Datenbankfehler: details (kann Werte enthalten) wird NICHT uebernommen
  await assert.rejects(
    lies(antwort(null, { message: 'duplicate key', code: '23505', details: 'Key (email)=(a@b.de) already exists.' }), 'x'),
    { message: 'x: duplicate key' },
  )
})

test('lies: nimmt auch error.cause als Ursache (falls details fehlt)', async () => {
  const cause = Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' })
  await assert.rejects(lies(antwort(null, { message: 'TypeError: fetch failed', code: '', cause }), 'accounts', OHNE_WARTEN), {
    message: 'accounts: TypeError: fetch failed (Caused by: Error: connect ETIMEDOUT 1.2.3.4:443 (ETIMEDOUT))',
  })
})

// ── Wiederholversuch ──

test('lies: einmaliger Netzfehler, danach Erfolg -> kein Fehler, Zeilen kommen zurueck, genau 2 Versuche', async () => {
  const f = abfolge([{ data: null, error: NETZFEHLER }, { data: [{ id: 'a' }], error: null }])
  assert.deepEqual(await lies(f.query, 'accounts', OHNE_WARTEN), [{ id: 'a' }])
  assert.equal(f.zaehler.aufrufe, 2)
})

test('lies: zwei Netzfehler hintereinander -> wirft MIT Ursache und dem Originalfehler als cause, nicht mehr als 2 Versuche', async () => {
  const f = abfolge([{ data: null, error: NETZFEHLER }, { data: null, error: NETZFEHLER }])
  await assert.rejects(lies(f.query, 'household_members', OHNE_WARTEN), (err: Error) => {
    assert.match(err.message, /^household_members: TypeError: fetch failed \(Caused by: Error: read ECONNRESET/)
    assert.equal(err.cause, NETZFEHLER, 'der urspruengliche Fehler haengt als cause am Error')
    return true
  })
  assert.equal(f.zaehler.aufrufe, 2, 'genau ein Wiederholversuch, nie ein dritter')
})

test('lies: Antwort der Datenbank mit Fehlercode (z. B. 42501) wird NICHT wiederholt', async () => {
  const f = abfolge([{ data: null, error: { message: 'permission denied for table x', code: '42501' } }])
  await assert.rejects(lies(f.query, 'x', OHNE_WARTEN), { message: 'x: permission denied for table x' })
  assert.equal(f.zaehler.aufrufe, 1)
})

test('lies: erfolgreiche Abfrage wird nur einmal ausgefuehrt', async () => {
  const f = abfolge([{ data: [{ id: 'a' }], error: null }])
  await lies(f.query, 'x', OHNE_WARTEN)
  assert.equal(f.zaehler.aufrufe, 1)
})

test('lies: wartet vor dem zweiten Versuch die angegebene Zeit', async () => {
  const f = abfolge([{ data: null, error: NETZFEHLER }, { data: [], error: null }])
  const t0 = Date.now()
  await lies(f.query, 'x', { wartezeitMs: 120 })
  assert.ok(Date.now() - t0 >= 100, 'Pause vor dem Wiederholen')
})
