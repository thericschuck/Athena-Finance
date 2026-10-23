import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueAufteilung, ringSegmente } from './aufteilung.ts'

const konten = [
  { id: 'a', name: 'Girokonto', type: 'checking', saldo: 162.76 },
  { id: 'b', name: 'Geschäftsanteile', type: 'investment', saldo: 1500 },
  { id: 'c', name: 'Sparkonto', type: 'savings', saldo: 6680 },
  { id: 'd', name: 'Kreditkarte', type: 'credit', saldo: -300 },
  { id: 'e', name: 'Überzogen', type: 'checking', saldo: -50 },
  { id: 'f', name: 'Kraken Konto', type: 'crypto', saldo: 40 },
]

test('Jedes Konto, jedes Depot und Krypto als eigener Posten, groesste zuerst', () => {
  const r = baueAufteilung({ konten, depots: [{ id: 'd1', name: 'Union Depot', wert: 2503 }], krypto: 97 })
  assert.deepEqual(r.posten.map(p => p.label), ['Sparkonto', 'Union Depot', 'Geschäftsanteile', 'Girokonto', 'Krypto'])
})

test('Minus und Kreditkonten stehen daneben, Kryptokonten nur ueber den Krypto-Posten', () => {
  const r = baueAufteilung({ konten, depots: [], krypto: 97 })
  assert.equal(r.minus, -350)
  assert.ok(!r.posten.some(p => p.label === 'Kraken Konto'))
  assert.equal(r.posten.find(p => p.key === 'krypto')?.value, 97)
})

test('Summe der Posten = total; Gesamt + Minus = Nettovermoegen der Bausteine', () => {
  const r = baueAufteilung({ konten, depots: [{ id: 'd1', name: 'Depot', wert: 2503 }], krypto: 97 })
  assert.equal(r.total, 162.76 + 1500 + 6680 + 2503 + 97)
  assert.equal(Math.round((r.total + r.minus) * 100) / 100, Math.round((10942.76 - 350) * 100) / 100)
})

test('Depot ohne Wert und Konto mit Saldo 0 erscheinen nicht', () => {
  const r = baueAufteilung({
    konten: [{ id: 'x', name: 'Leer', type: 'checking', saldo: 0 }],
    depots: [{ id: 'd', name: 'Leer', wert: 0 }],
    krypto: 0,
  })
  assert.equal(r.posten.length, 0)
  assert.equal(r.total, 0)
})

test('ringSegmente: Anteile summieren sich zu 1, Starts laufen auf', () => {
  const s = ringSegmente([{ value: 50 }, { value: 30 }, { value: 20 }])
  assert.deepEqual(s.map(x => x.anteil), [0.5, 0.3, 0.2])
  assert.deepEqual(s.map(x => x.start), [0, 0.5, 0.8])
  assert.deepEqual(ringSegmente([{ value: 0 }]), [{ start: 0, anteil: 0 }])
})
