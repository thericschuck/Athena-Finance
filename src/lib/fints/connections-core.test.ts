import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  buildInsertRow, deriveBankKey, envCredentials, isEnvConnectionUser, maskUsername,
  resolveFromRows, rowToCredentials, rowToPublic, validateFintsUrl,
  type BankConnectionRow, type EnvLike,
} from './connections-core.ts'

process.env.ENCRYPTION_KEY = 'test-key-nur-fuer-tests'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SECRET_USER = 'VRNetKey-Geheim-4711'
const SECRET_PIN = 'PIN-Geheim-98765'

const input = {
  label: ' Meine Bank ',
  fintsUrl: 'https://fints.example.de/fints',
  blz: '123 456 78',
  username: `  ${SECRET_USER} `,
  pin: SECRET_PIN,
  tanMedium: ' ',
}

function toRow(userId = USER): BankConnectionRow {
  const ins = buildInsertRow(userId, input)
  return {
    ...ins, id: 'c1', created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z',
    last_sync_at: null, last_error: null,
  }
}

const fullEnv: EnvLike = {
  FINTS_URL: 'https://env.example.de/fints', FINTS_BLZ: '12345678',
  FINTS_USERNAME: 'envuser', FINTS_PIN: 'envpin', BANK_SYNC_USER_ID: USER,
}

test('deriveBankKey: sha256(blz:username)[:32], blz nur Ziffern, username getrimmt', () => {
  const expected = createHash('sha256').update('12345678:abc').digest('hex').slice(0, 32)
  assert.equal(deriveBankKey('1234 5678', ' abc '), expected)
  assert.equal(expected.length, 32)
})

test('Roundtrip: verschluesselt speichern, serverseitig wieder entschluesseln', () => {
  const creds = rowToCredentials(toRow())
  assert.equal(creds.username, SECRET_USER)
  assert.equal(creds.pin, SECRET_PIN)
  assert.equal(creds.blz, '12345678')
  assert.equal(creds.label, 'Meine Bank')
  assert.equal(creds.tanMedium, null)
  assert.equal(creds.source, 'db')
  assert.equal(creds.bankKey, deriveBankKey('12345678', SECRET_USER))
})

test('Gespeicherte Struktur enthaelt keinen Klartext', () => {
  const json = JSON.stringify(buildInsertRow(USER, input))
  assert.ok(!json.includes(SECRET_PIN))
  assert.ok(!json.includes(SECRET_USER))
  const ins = buildInsertRow(USER, input)
  assert.match(ins.pin_enc, /^[^:]+:[^:]+:[^:]+$/)
  assert.match(ins.username_enc, /^[^:]+:[^:]+:[^:]+$/)
})

test('Zwei Verschluesselungen derselben PIN unterscheiden sich (zufaelliger IV)', () => {
  assert.notEqual(buildInsertRow(USER, input).pin_enc, buildInsertRow(USER, input).pin_enc)
})

test('rowToPublic enthaelt keine Geheimnisse und nur den maskierten Namen', () => {
  const pub = rowToPublic(toRow())
  const json = JSON.stringify(pub)
  assert.ok(!json.includes(SECRET_PIN))
  assert.ok(!json.includes(SECRET_USER))
  assert.ok(!json.includes('_enc'))
  assert.equal(pub.usernameHint, maskUsername(SECRET_USER))
  assert.ok(pub.usernameHint?.startsWith('***'))
})

test('Entschluesselung mit falschem Schluessel: Fehler ohne Klartext/Chiffretext', () => {
  const row = toRow()
  process.env.ENCRYPTION_KEY = 'anderer-schluessel'
  try {
    assert.throws(() => rowToCredentials(row), (e: unknown) => {
      const msg = (e as Error).message
      return msg.includes('Meine Bank') && !msg.includes(row.pin_enc) && !msg.includes(SECRET_PIN)
    })
  } finally {
    process.env.ENCRYPTION_KEY = 'test-key-nur-fuer-tests'
  }
})

test('maskUsername: lange Kennung letzte 3 Zeichen, kurze komplett maskiert', () => {
  assert.equal(maskUsername('abcdefgh'), '***fgh')
  assert.equal(maskUsername('abc'), '***')
})

test('validateFintsUrl', () => {
  assert.equal(validateFintsUrl('https://fints1.atruvia.de/cgi-bin/hbciservlet').ok, true)
  for (const bad of [
    'http://fints.example.de/x', 'ftp://x.de', 'nonsense', 'https://localhost/x', 'https://127.0.0.1/x',
    'https://10.0.0.5/x', 'https://192.168.1.1/x', 'https://169.254.169.254/x', 'https://[::1]/x',
    'https://intern/x', 'https://db.internal/x', 'https://u:p@fints.example.de/x', 'https://fints.example.de:8443/x',
  ]) {
    assert.equal(validateFintsUrl(bad).ok, false, bad)
  }
})

test('envCredentials: vollstaendig -> Verbindung, unvollstaendig -> null', () => {
  const c = envCredentials(fullEnv)
  assert.ok(c)
  assert.equal(c.source, 'env')
  assert.equal(c.connectionId, null)
  assert.equal(c.label, 'Raiffeisenbank')
  assert.equal(envCredentials({ ...fullEnv, FINTS_PIN: '' }), null)
  assert.equal(envCredentials({ ...fullEnv, FINTS_BLZ: '123' }), null)
})

test('Fallback: Env-Nutzer ohne eigene Verbindung -> Env-Verbindung', () => {
  const r = resolveFromRows(USER, [], fullEnv)
  assert.equal(r.source, 'env')
  assert.equal(r.connections.length, 1)
  assert.equal(r.connections[0].username, 'envuser')
})

test('Fallback: Env-Nutzer MIT eigener Verbindung -> nur DB, Env wird verdraengt', () => {
  const r = resolveFromRows(USER, [toRow()], fullEnv)
  assert.equal(r.source, 'db')
  assert.equal(r.connections.length, 1)
  assert.equal(r.connections[0].username, SECRET_USER)
})

test('Fallback: anderer Nutzer ohne Verbindung bekommt NIE die Env-Verbindung', () => {
  const r = resolveFromRows(OTHER, [], fullEnv)
  assert.equal(r.source, 'none')
  assert.equal(r.connections.length, 0)
})

test('Fallback: anderer Nutzer mit eigener Verbindung -> DB', () => {
  assert.equal(resolveFromRows(OTHER, [toRow(OTHER)], fullEnv).source, 'db')
})

test('Fallback: Env unvollstaendig oder BANK_SYNC_USER_ID fehlt -> none', () => {
  assert.equal(resolveFromRows(USER, [], { ...fullEnv, FINTS_PIN: undefined }).source, 'none')
  assert.equal(resolveFromRows(USER, [], { ...fullEnv, BANK_SYNC_USER_ID: undefined }).source, 'none')
  assert.equal(isEnvConnectionUser(USER, { ...fullEnv, BANK_SYNC_USER_ID: '' }), false)
})
