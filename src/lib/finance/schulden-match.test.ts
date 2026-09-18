import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchDebtForText, type SchuldFuerAbgleich } from './schulden-match.ts'

const schulden: SchuldFuerAbgleich[] = [
  { id: 'd1', name: 'Auto-Kredit', creditor: 'Sparkasse Nuernberg' },
  { id: 'd2', name: 'Max Mustermann', creditor: null },
]

test('eindeutiger Treffer ueber den Glaeubiger', () => {
  const treffer = matchDebtForText('Sparkasse Nuernberg Rate 08/2026', schulden)
  assert.equal(treffer?.id, 'd1')
})

test('eindeutiger Treffer ueber den Namen', () => {
  const treffer = matchDebtForText('Rueckzahlung an Max Mustermann', schulden)
  assert.equal(treffer?.id, 'd2')
})

test('kein Treffer bleibt null', () => {
  assert.equal(matchDebtForText('Rewe Markt Einkauf', schulden), null)
  assert.equal(matchDebtForText(null, schulden), null)
})

test('mehrdeutiger Treffer wird nicht geraten', () => {
  const mehrdeutig: SchuldFuerAbgleich[] = [
    { id: 'd1', name: 'Kredit Schmidt', creditor: null },
    { id: 'd2', name: 'Kredit Meyer', creditor: null },
  ]
  // "Kredit" allein passt auf beide -- kein einzelner Treffer.
  assert.equal(matchDebtForText('Kredit Ueberweisung', mehrdeutig), null)
})
