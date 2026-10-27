import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geteiltAusForm } from './teilen.ts'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

test('geteiltAusForm: ohne Schalter nichts aendern', () => {
  assert.equal(geteiltAusForm(fd({ name: 'x' })), undefined)
  assert.equal(geteiltAusForm(fd({ shared: 'on' })), undefined)
})

test('geteiltAusForm: Schalter vorhanden, Haken gesetzt/nicht gesetzt', () => {
  assert.equal(geteiltAusForm(fd({ shared_form: '1', shared: 'on' })), true)
  assert.equal(geteiltAusForm(fd({ shared_form: '1' })), false)
  assert.equal(geteiltAusForm(fd({ shared_form: '1', shared: 'nein' })), false)
})
