import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupCategoriesByParent, type CategoryForGrouping } from './category-groups.ts'

const categories: CategoryForGrouping[] = [
  { id: 'lebenserhaltung', name: 'Lebenserhaltung', parent_id: null },
  { id: 'shopping', name: 'Shopping', parent_id: 'lebenserhaltung' },
  { id: 'lebensmittel', name: 'Lebensmittel', parent_id: 'lebenserhaltung' },
  { id: 'crypto', name: 'Crypto', parent_id: null },
  { id: 'schera', name: 'Schera GmbH', parent_id: 'gehalt' },
  { id: 'gehalt', name: 'Gehalt', parent_id: null },
]

test('Hauptkategorien alphabetisch, Kinder je Gruppe alphabetisch', () => {
  const groups = groupCategoriesByParent(categories)
  assert.deepEqual(groups.map((g) => g.parent.name), ['Crypto', 'Gehalt', 'Lebenserhaltung'])
  assert.deepEqual(
    groups.find((g) => g.parent.name === 'Lebenserhaltung')?.children.map((c) => c.name),
    ['Lebensmittel', 'Shopping'],
  )
})

test('Kategorie ohne Kinder bekommt ein leeres Array', () => {
  const groups = groupCategoriesByParent(categories)
  assert.deepEqual(groups.find((g) => g.parent.name === 'Crypto')?.children, [])
})

test('Kind mit unbekanntem parent_id (Filter/Auswahl ohne diese Kategorie) wird selbst zur Wurzel', () => {
  const ohneGehalt = categories.filter((c) => c.id !== 'gehalt')
  const groups = groupCategoriesByParent(ohneGehalt)
  assert.ok(groups.some((g) => g.parent.name === 'Schera GmbH'))
})
