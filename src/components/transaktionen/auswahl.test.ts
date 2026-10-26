import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alleGewaehlt,
  auswahlZusammenfassung,
  betragTon,
  ergebnisText,
  herkunftText,
  manuelleIds,
  seiteUmschalten,
  vorzeichenText,
  type Quelle,
} from './auswahl.ts'

const seite = [
  { id: 'a', source: 'manual' as Quelle },
  { id: 'b', source: 'bank_sync' as Quelle },
  { id: 'c', source: 'bank_sync' as Quelle },
]

test('Zusammenfassung zählt manuelle und Bankzeilen', () => {
  const m = new Map<string, Quelle>([['a', 'manual'], ['b', 'bank_sync']])
  assert.deepEqual(auswahlZusammenfassung(m), { anzahl: 2, manuell: 1, bank: 1 })
  assert.deepEqual(manuelleIds(m), ['a'])
})

test('Seite umschalten: erst alle wählen, dann alle abwählen, fremde Auswahl bleibt', () => {
  const start = new Map<string, Quelle>([['x', 'manual']])
  const voll = seiteUmschalten(start, seite)
  assert.equal(voll.size, 4)
  assert.equal(alleGewaehlt(voll, seite), true)
  const leer = seiteUmschalten(voll, seite)
  assert.deepEqual([...leer.keys()], ['x'])
  assert.equal(alleGewaehlt(new Map(), []), false)
})

test('Betragston: Umbuchung neutral, Einnahme grün, Ausgabe rot', () => {
  assert.equal(betragTon('transfer', -5), 'neutral')
  assert.equal(betragTon('income', 5), 'plus')
  assert.equal(betragTon('expense', -5), 'minus')
  assert.equal(betragTon('expense', 0), 'normal')
})

test('Texte', () => {
  assert.equal(ergebnisText(1, 'geändert'), '1 Buchung geändert')
  assert.equal(ergebnisText(3, 'gelöscht'), '3 Buchungen gelöscht')
  assert.equal(herkunftText('auto'), 'Regel / Gelerntes')
  assert.equal(herkunftText('ai'), 'KI')
  assert.equal(herkunftText('manual'), 'von dir')
  assert.equal(herkunftText(null), null)
  assert.equal(vorzeichenText(-1), '−')
  assert.equal(vorzeichenText(0), '')
})
