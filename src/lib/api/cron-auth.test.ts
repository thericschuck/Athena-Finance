import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCronAuth } from './cron-auth.ts'

test('korrekter Header -> ok', () => {
  assert.equal(checkCronAuth('Bearer geheim', 'geheim'), 'ok')
})

test('fehlendes/leeres Secret -> unconfigured (fail-closed), auch mit passendem Header', () => {
  assert.equal(checkCronAuth('Bearer undefined', undefined), 'unconfigured')
  assert.equal(checkCronAuth('Bearer ', ''), 'unconfigured')
  assert.equal(checkCronAuth('Bearer ', null), 'unconfigured')
  assert.equal(checkCronAuth(null, undefined), 'unconfigured')
})

test('fehlender/leerer Header -> unauthorized', () => {
  assert.equal(checkCronAuth(null, 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth(undefined, 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('', 'geheim'), 'unauthorized')
})

test('falsches Secret, gleiche Länge -> unauthorized', () => {
  assert.equal(checkCronAuth('Bearer geheiM', 'geheim'), 'unauthorized')
})

test('unterschiedliche Längen (kürzer/länger/Präfix) -> unauthorized, kein Throw', () => {
  assert.equal(checkCronAuth('Bearer geheim1', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer geheim', 'geheim1'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer ', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer', 'geheim'), 'unauthorized')
})

test('Schema muss exakt "Bearer " sein (Groß/Kleinschreibung, nur Secret, Whitespace)', () => {
  assert.equal(checkCronAuth('bearer geheim', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('geheim', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer  geheim', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer geheim ', 'geheim'), 'unauthorized')
  assert.equal(checkCronAuth(' Bearer geheim', 'geheim'), 'unauthorized')
})

test('Secret mit Sonderzeichen/Unicode/Leerzeichen', () => {
  for (const secret of ['a b', 'p@ss/w+rd=', 'äöü€🔑', 'with"quote\'s', '$ecret`x`', 'Bearer x']) {
    assert.equal(checkCronAuth(`Bearer ${secret}`, secret), 'ok', secret)
    assert.equal(checkCronAuth(`Bearer ${secret}x`, secret), 'unauthorized', secret)
  }
})

test('Byte- statt Zeichenlänge: gleiche Zeichenzahl, andere Byte-Länge -> unauthorized', () => {
  // 'ä' = 2 Byte, 'a' = 1 Byte
  assert.equal(checkCronAuth('Bearer aaaa', 'ääää'), 'unauthorized')
  assert.equal(checkCronAuth('Bearer ääää', 'aaaa'), 'unauthorized')
})

test('Secret "undefined" als echter String funktioniert, "Bearer undefined" ohne Secret nicht', () => {
  assert.equal(checkCronAuth('Bearer undefined', 'undefined'), 'ok')
  assert.equal(checkCronAuth('Bearer undefined', undefined), 'unconfigured')
})
