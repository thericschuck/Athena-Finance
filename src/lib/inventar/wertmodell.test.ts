import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modellpunkte, wertfaktor, type ModellEingabe } from './wertmodell.ts'

const basis: ModellEingabe = {
  kategorie: 'technik',
  nutzung: 'regelmaessig',
  ankerWert: 1000,
  ankerDatum: '2025-01-01',
  gekauftAm: '2025-01-01',
  kaufpreis: 1000,
}
const heute = new Date('2027-01-01T12:00:00')

test('Wert sinkt nie und liegt nie über dem Anker', () => {
  const p = modellpunkte(basis, heute)
  assert.ok(p.length > 0)
  let vorher = basis.ankerWert
  for (const x of p) {
    assert.ok(x.wert <= vorher, `${x.datum}: ${x.wert} > ${vorher}`)
    vorher = x.wert
  }
})

test('Kurve ist vorne steil, nicht linear', () => {
  const fruehesJahr = 1 - wertfaktor(basis, new Date('2026-01-01T12:00:00'))
  const spaetesJahr = wertfaktor(basis, new Date('2026-01-01T12:00:00')) - wertfaktor(basis, heute)
  assert.ok(fruehesJahr > spaetesJahr * 1.2)
})

test('Mehr Nutzung bedeutet mehr Verlust, „nie" verliert nur den Zeitanteil', () => {
  const f = (nutzung: string) => wertfaktor({ ...basis, nutzung }, heute)
  assert.ok(f('nie') > f('selten'))
  assert.ok(f('selten') > f('regelmaessig'))
  assert.ok(f('regelmaessig') > f('taeglich'))
  assert.ok(f('nie') < 1)
})

test('Kunst und Münzen verlieren nichts', () => {
  assert.equal(wertfaktor({ ...basis, kategorie: 'kunst' }, heute), 1)
  const p = modellpunkte({ ...basis, kategorie: 'muenze' }, heute)
  assert.deepEqual(p.map(x => x.wert), [1000])
})

test('Boden wird eingehalten', () => {
  const spaet = new Date('2060-01-01T12:00:00')
  const p = modellpunkte(basis, spaet)
  assert.ok(p[p.length - 1].wert >= 1000 * 0.08 - 0.01)
})

test('Ein älteres Stück ist schon im flachen Teil der Kurve', () => {
  const neu = wertfaktor(basis, new Date('2025-07-01T12:00:00'))
  const alt = wertfaktor(
    { ...basis, gekauftAm: '2020-01-01', ankerDatum: '2025-01-01' },
    new Date('2025-07-01T12:00:00'),
  )
  assert.ok(alt > neu)
})

test('Kein Punkt, wenn der Anker heute ist', () => {
  assert.deepEqual(modellpunkte({ ...basis, ankerDatum: '2027-01-01' }, heute), [])
})

test('Letzter Punkt ist immer heute', () => {
  const p = modellpunkte(basis, heute)
  assert.equal(p[p.length - 1].datum, '2027-01-01')
})
