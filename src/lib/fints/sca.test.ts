import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isScaRequiredError, stateFromError } from './sca.ts'

test('isScaRequiredError: Error-Objekt mit code', () => {
  const e = Object.assign(new Error('Freigabe nötig'), { code: 'sca_required' })
  assert.equal(isScaRequiredError(e), true)
})

test('isScaRequiredError: Plain Object mit code', () => {
  assert.equal(isScaRequiredError({ code: 'sca_required' }), true)
})

test('isScaRequiredError: anderer/fehlender code -> false', () => {
  assert.equal(isScaRequiredError(new Error('sca_required')), false)
  assert.equal(isScaRequiredError({ code: 'other' }), false)
  assert.equal(isScaRequiredError({ code: 'SCA_REQUIRED' }), false)
  assert.equal(isScaRequiredError({ code: null }), false)
  assert.equal(isScaRequiredError({}), false)
})

test('isScaRequiredError: String, null, undefined, Zahl -> false', () => {
  assert.equal(isScaRequiredError('sca_required'), false)
  assert.equal(isScaRequiredError(null), false)
  assert.equal(isScaRequiredError(undefined), false)
  assert.equal(isScaRequiredError(42), false)
  assert.equal(isScaRequiredError(true), false)
})

test('isScaRequiredError: verschachtelt (cause/error) wird NICHT erkannt', () => {
  assert.equal(isScaRequiredError({ cause: { code: 'sca_required' } }), false)
  assert.equal(isScaRequiredError(new Error('x', { cause: { code: 'sca_required' } })), false)
  assert.equal(isScaRequiredError({ error: { code: 'sca_required' } }), false)
})

test('isScaRequiredError: Array/Funktion', () => {
  assert.equal(isScaRequiredError([]), false)
  assert.equal(isScaRequiredError(Object.assign(() => 0, { code: 'sca_required' })), false) // typeof function
})

test('stateFromError: liefert state aus Error und Plain Object', () => {
  const state = { 'Bank A': { systemId: '123' } } as never
  assert.equal(stateFromError(Object.assign(new Error('x'), { state })), state)
  assert.equal(stateFromError({ state }), state)
})

test('stateFromError: ohne state / Nicht-Objekte -> undefined', () => {
  assert.equal(stateFromError(new Error('x')), undefined)
  assert.equal(stateFromError({}), undefined)
  assert.equal(stateFromError(null), undefined)
  assert.equal(stateFromError(undefined), undefined)
  assert.equal(stateFromError('state'), undefined)
  assert.equal(stateFromError(7), undefined)
  assert.equal(stateFromError({ cause: { state: {} } }), undefined)
})
