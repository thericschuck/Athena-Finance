import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardLeer, type LeerKern } from './leer.ts'

const basis: LeerKern = { netWorth: 0, konten: [], depots: [], krypto: { gesamt: 0 }, snapshots: [] }

test('ohne alles: leer, keine Konten, Verlauf leer', () => {
  assert.deepEqual(dashboardLeer(basis), { keineKonten: true, keineBuchungen: true, leer: true, verlauf: 'leer' })
})

test('Konto ohne Buchung: keine Buchungen, aber Konten; Verlauf wartet', () => {
  const r = dashboardLeer({ ...basis, konten: [{ hatBuchungen: false }], snapshots: [1] })
  assert.deepEqual(r, { keineKonten: false, keineBuchungen: true, leer: true, verlauf: 'wartet' })
})

test('Konto mit Buchung: nicht leer, Verlauf ab zwei Snapshots', () => {
  const r = dashboardLeer({ ...basis, netWorth: 100, konten: [{ hatBuchungen: false }, { hatBuchungen: true }], snapshots: [1, 2] })
  assert.deepEqual(r, { keineKonten: false, keineBuchungen: false, leer: false, verlauf: 'daten' })
})

test('nur Depot oder Krypto: nicht leer, obwohl keine Konten', () => {
  assert.equal(dashboardLeer({ ...basis, depots: [{}] }).leer, false)
  assert.equal(dashboardLeer({ ...basis, krypto: { gesamt: 5 } }).leer, false)
  assert.equal(dashboardLeer({ ...basis, netWorth: -50 }).leer, false)
})
