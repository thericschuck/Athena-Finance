import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kernaussage, lageImVerlauf } from './verteilung.ts'

const fmt = (n: number) => `${n} €`

test('lageImVerlauf: Viertel-Grenzen', () => {
  assert.equal(lageImVerlauf(75), 'oben')
  assert.equal(lageImVerlauf(74), 'mitte')
  assert.equal(lageImVerlauf(26), 'mitte')
  assert.equal(lageImVerlauf(25), 'unten')
  assert.equal(lageImVerlauf(0), 'unten')
})

test('kernaussage: mit laufendem Monat', () => {
  assert.equal(
    kernaussage({ anzahlMonate: 18, median: 1100, aktuell: 1234, percentile: 83, darunter: 15 }, fmt),
    'Dieser Monat: 1234 € — im oberen Viertel (höher als in 15 von 18 Monaten). Typisch (Median): 1100 €.',
  )
})

test('kernaussage: ohne laufenden Monat nur der typische Wert', () => {
  assert.equal(
    kernaussage({ anzahlMonate: 12, median: 900, aktuell: null, percentile: null, darunter: null }, fmt),
    'Ein typischer Monat liegt bei 900 € (Median der letzten 12 Monate).',
  )
})
