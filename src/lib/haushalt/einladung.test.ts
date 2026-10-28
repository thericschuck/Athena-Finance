import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  erzeugeToken, hashToken, istTokenFormat, normalisiereEmail, einladungsLink,
  mappeAnnahmeFehler, bereinigeName,
} from './einladung.ts'

test('Token: 43 Zeichen base64url, zufaellig, Format-Check', () => {
  const a = erzeugeToken()
  const b = erzeugeToken()
  assert.equal(a.length, 43)
  assert.match(a, /^[A-Za-z0-9_-]+$/)
  assert.notEqual(a, b)
  assert.equal(istTokenFormat(a), true)
  assert.equal(istTokenFormat(a + 'x'), false)
  assert.equal(istTokenFormat(a.slice(1)), false)
  assert.equal(istTokenFormat('a'.repeat(42) + '+'), false)
  assert.equal(istTokenFormat(undefined), false)
  assert.equal(istTokenFormat(123), false)
})

test('Hash: sha256 hex, stabil, nicht der Klartext', () => {
  const t = 'A'.repeat(43)
  const h = hashToken(t)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.equal(h, hashToken(t))
  assert.notEqual(h, hashToken('B'.repeat(43)))
  assert.ok(!h.includes(t))
  // bekannter Wert (sha256 von "abc")
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('E-Mail und Link', () => {
  assert.equal(normalisiereEmail('  Malik.Semmler@Gmail.com '), 'malik.semmler@gmail.com')
  assert.equal(einladungsLink('https://x.de/', 'tok'), 'https://x.de/einladung/tok')
})

test('Annahme-Fehler: alle Token-Probleme sind ein Code', () => {
  assert.equal(mappeAnnahmeFehler('invite_invalid'), 'ungueltig')
  assert.equal(mappeAnnahmeFehler('already_in_other_household'), 'anderer_haushalt')
  assert.equal(mappeAnnahmeFehler('iban_conflict'), 'iban_konflikt')
  assert.equal(mappeAnnahmeFehler('irgendwas'), 'unbekannt')
  assert.equal(mappeAnnahmeFehler(null), 'unbekannt')
})

test('Anzeigename wird bereinigt', () => {
  assert.equal(bereinigeName('  Malik\u0000 \n'), 'Malik')
  assert.equal(bereinigeName('x'.repeat(100)).length, 60)
})
