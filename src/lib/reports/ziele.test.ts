import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestimmeReportZiele } from './ziele.ts'

test('beide Env-Variablen gesetzt: genau ein Ziel wie bisher', () => {
  assert.deepEqual(bestimmeReportZiele({ userId: 'u1', recipient: 'a@b.de' }, ['u1', 'u2']), [{ userId: 'u1', recipient: 'a@b.de' }])
})

test('nur REPORT_USER_ID: Empfaenger wird aus auth.users aufgeloest', () => {
  assert.deepEqual(bestimmeReportZiele({ userId: 'u1' }, ['u1', 'u2']), [{ userId: 'u1', recipient: null }])
})

test('keine Env-Variablen: alle Nutzer, ohne Duplikate; Empfaenger-Variable allein wird ignoriert', () => {
  assert.deepEqual(bestimmeReportZiele({ recipient: 'x@y.de' }, ['u1', 'u2', 'u1']), [
    { userId: 'u1', recipient: null }, { userId: 'u2', recipient: null },
  ])
})

test('keine Nutzer: leere Liste', () => {
  assert.deepEqual(bestimmeReportZiele({}, []), [])
})
