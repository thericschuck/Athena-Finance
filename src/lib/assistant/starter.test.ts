import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startfragenFuerRoute } from './starter.ts'

test('jede bekannte Route liefert vier verschiedene Fragen', () => {
  for (const pfad of ['/dashboard', '/analyse', '/finance', '/depot', '/crypto', '/inventar', '/strategy', '/assistant']) {
    const fragen = startfragenFuerRoute(pfad)
    assert.equal(fragen.length, 4, pfad)
    assert.equal(new Set(fragen).size, 4, pfad)
  }
})

test('Unterseiten und Query gehören zum Bereich', () => {
  assert.deepEqual(startfragenFuerRoute('/depot/abc?x=1'), startfragenFuerRoute('/depot'))
  assert.deepEqual(startfragenFuerRoute('/analyse/auffaelligkeiten'), startfragenFuerRoute('/analyse'))
})

test('unbekannte Pfade und Beinahe-Treffer fallen auf allgemein zurück', () => {
  const allgemein = startfragenFuerRoute('/assistant')
  assert.deepEqual(startfragenFuerRoute('/irgendwas'), allgemein)
  assert.deepEqual(startfragenFuerRoute('/financex'), allgemein)
  assert.deepEqual(startfragenFuerRoute(''), allgemein)
  assert.notDeepEqual(startfragenFuerRoute('/dashboard'), allgemein)
})

test('Rückgabe ist eine Kopie', () => {
  const a = startfragenFuerRoute('/assistant')
  a.push('x')
  assert.equal(startfragenFuerRoute('/assistant').length, 4)
})
