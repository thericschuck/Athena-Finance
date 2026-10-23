import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balkenDeckkraft, mindestBreite, monatKlartext, naechsteMonatsauswahl } from './vergleichsdaten.ts'

test('monatKlartext', () => {
  assert.equal(monatKlartext('2026-03'), 'März 2026')
  assert.equal(monatKlartext('2025-12'), 'Dezember 2025')
  assert.equal(monatKlartext('2026-13'), '2026-13')
  assert.equal(monatKlartext('quatsch'), 'quatsch')
})

test('naechsteMonatsauswahl: setzen, wechseln, aufheben, ohne key ignorieren', () => {
  assert.equal(naechsteMonatsauswahl('2026-03', null), '2026-03')
  assert.equal(naechsteMonatsauswahl('2026-03', '2026-02'), '2026-03')
  assert.equal(naechsteMonatsauswahl('2026-03', '2026-03'), null)
  assert.equal(naechsteMonatsauswahl(undefined, '2026-03'), undefined)
})

test('balkenDeckkraft: ohne Auswahl wie bisher, mit Auswahl nur der gewählte voll', () => {
  assert.equal(balkenDeckkraft(false, '2026-03', null), 0.75)
  assert.equal(balkenDeckkraft(true, '2026-03', null), 0.35)
  assert.equal(balkenDeckkraft(false, '2026-03', '2026-03'), 1)
  assert.equal(balkenDeckkraft(true, '2026-03', '2026-03'), 0.6)
  assert.equal(balkenDeckkraft(false, '2026-02', '2026-03'), 0.22)
  assert.equal(balkenDeckkraft(false, undefined, '2026-03'), 0.22)
})

test('mindestBreite', () => {
  assert.equal(mindestBreite(25), 750)
  assert.equal(mindestBreite(-1), 0)
})
