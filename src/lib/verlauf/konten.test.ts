import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseKonto, parseZeitraum, sampleReihe, sparklinePfad, veraenderung, zeitraumStart,
} from './konten.ts'

test('parseZeitraum: unbekannt faellt auf Standard 1y', () => {
  assert.equal(parseZeitraum('6m'), '6m')
  assert.equal(parseZeitraum('max'), 'max')
  assert.equal(parseZeitraum('foo'), '1y')
  assert.equal(parseZeitraum(undefined), '1y')
})

test('parseKonto: nur eigene IDs, sonst alle', () => {
  assert.equal(parseKonto('a', ['a', 'b']), 'a')
  assert.equal(parseKonto('x', ['a', 'b']), 'alle')
  assert.equal(parseKonto(undefined, ['a']), 'alle')
})

test('zeitraumStart: Monate zurueck, am Monatsende geklammert, max = null', () => {
  assert.equal(zeitraumStart('3m', new Date('2026-10-23T12:00:00Z')), '2026-07-23')
  assert.equal(zeitraumStart('1y', new Date('2026-10-23T12:00:00Z')), '2025-10-23')
  assert.equal(zeitraumStart('6m', new Date('2026-08-31T12:00:00Z')), '2026-02-28')
  assert.equal(zeitraumStart('max', new Date('2026-10-23T12:00:00Z')), null)
})

test('sampleReihe: behaelt erste und letzte, begrenzt Laenge, bleibt aufsteigend', () => {
  const reihe = Array.from({ length: 1000 }, (_, i) => i)
  const s = sampleReihe(reihe, 60)
  assert.equal(s.length, 60)
  assert.equal(s[0], 0)
  assert.equal(s[s.length - 1], 999)
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1])
})

test('sampleReihe: kurze Reihe unveraendert (Kopie)', () => {
  const r = [1, 2, 3]
  const s = sampleReihe(r, 60)
  assert.deepEqual(s, r)
  assert.notEqual(s, r)
})

test('veraenderung: absolut und Prozent; kein Prozent bei Start <= 0', () => {
  assert.deepEqual(
    veraenderung([{ datum: 'a', saldo: 100 }, { datum: 'b', saldo: 150 }]),
    { abs: 50, prozent: 50 },
  )
  assert.deepEqual(
    veraenderung([{ datum: 'a', saldo: -100 }, { datum: 'b', saldo: 50 }]),
    { abs: 150, prozent: null },
  )
  assert.equal(veraenderung([{ datum: 'a', saldo: 1 }]), null)
})

test('sparklinePfad: leer bei < 2, flache Reihe mittig, hoher Wert oben', () => {
  assert.equal(sparklinePfad([1], 100, 20), '')
  assert.equal(sparklinePfad([5, 5], 100, 20), 'M0.0,10.0 L100.0,10.0')
  assert.equal(sparklinePfad([0, 10], 100, 20, 2), 'M0.0,18.0 L100.0,2.0')
})
