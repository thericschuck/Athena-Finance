import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ladeSchluessel, speichereSchluessel, loescheSchluessel } from './schluessel-core.ts'

type Aufruf = { tabelle: string; kette: [string, ...unknown[]][] }

/** Fake-Client: zeichnet die Aufrufkette auf und liefert `antwort`. */
function fake(antwort: { data?: unknown; error?: { message: string } | null } = {}) {
  const aufrufe: Aufruf[] = []
  const db = {
    from(tabelle: string) {
      const a: Aufruf = { tabelle, kette: [] }
      aufrufe.push(a)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'upsert', 'delete', 'eq', 'maybeSingle']) {
        b[m] = (...args: unknown[]) => { a.kette.push([m, ...args]); return b }
      }
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: antwort.data ?? null, error: antwort.error ?? null }).then(ok)
      return b
    },
  }
  return { db: db as unknown as Parameters<typeof ladeSchluessel>[0], aufrufe }
}
const eqs = (a: Aufruf) => a.kette.filter(k => k[0] === 'eq').map(k => `${k[1]}=${k[2]}`)

test('ladeSchluessel: filtert auf user_id UND exchange, liest nur die Chiffrate', async () => {
  const f = fake({ data: { api_key: 'k', api_secret: 's' } })
  assert.deepEqual(await ladeSchluessel(f.db, 'u1', 'kraken'), { api_key: 'k', api_secret: 's' })
  assert.equal(f.aufrufe[0].tabelle, 'exchange_keys')
  assert.deepEqual(eqs(f.aufrufe[0]), ['user_id=u1', 'exchange=kraken'])
  assert.deepEqual(f.aufrufe[0].kette[0], ['select', 'api_key, api_secret'])
})

test('ladeSchluessel: keine Zeile -> null; Datenbankfehler -> wirft (nie "kein Schluessel" vortaeuschen)', async () => {
  assert.equal(await ladeSchluessel(fake({ data: null }).db, 'u1', 'kraken'), null)
  await assert.rejects(ladeSchluessel(fake({ error: { message: 'boom' } }).db, 'u1', 'kraken'), { message: 'exchange_keys: boom' })
})

test('speichereSchluessel: Upsert mit user_id, onConflict user_id,exchange; Fehler als Meldung', async () => {
  const f = fake()
  assert.deepEqual(await speichereSchluessel(f.db, 'u1', 'kraken', 'KENC', 'SENC'), { error: null })
  const up = f.aufrufe[0].kette.find(k => k[0] === 'upsert')!
  assert.deepEqual(up[1], { user_id: 'u1', exchange: 'kraken', api_key: 'KENC', api_secret: 'SENC' })
  assert.deepEqual(up[2], { onConflict: 'user_id,exchange' })
  assert.deepEqual(await speichereSchluessel(fake({ error: { message: 'rls' } }).db, 'u1', 'kraken', 'a', 'b'), { error: 'rls' })
})

test('loescheSchluessel: loescht nur mit user_id UND exchange', async () => {
  const f = fake()
  assert.deepEqual(await loescheSchluessel(f.db, 'u1', 'kraken_futures'), { error: null })
  assert.deepEqual(eqs(f.aufrufe[0]), ['user_id=u1', 'exchange=kraken_futures'])
  assert.deepEqual(await loescheSchluessel(fake({ error: { message: 'x' } }).db, 'u1', 'kraken'), { error: 'x' })
})

test('ohne Nutzer-ID wird NICHT zugegriffen (der Admin-Client umgeht die RLS)', async () => {
  for (const leer of ['', '  ']) {
    const f = fake()
    await assert.rejects(ladeSchluessel(f.db, leer, 'kraken'), /user_id fehlt/)
    await assert.rejects(speichereSchluessel(f.db, leer, 'kraken', 'a', 'b'), /user_id fehlt/)
    await assert.rejects(loescheSchluessel(f.db, leer, 'kraken'), /user_id fehlt/)
    assert.equal(f.aufrufe.length, 0)
  }
})
