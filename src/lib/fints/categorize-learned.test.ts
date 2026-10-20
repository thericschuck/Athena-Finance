import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLearnedCategoryMap, normalizeCounterpart, suggestCategory } from './categorize.ts'
import type { FinanceCategory } from '@/types/bank'

const cat = (id: string, name = id): FinanceCategory =>
  ({ id, name, type: 'expense', color: null, icon: null, parent_id: null })

test('normalizeCounterpart: trim, lowercase, Whitespace kollabieren', () => {
  assert.equal(normalizeCounterpart('  REWE   Markt \t GmbH '), 'rewe markt gmbh')
  assert.equal(normalizeCounterpart(''), '')
})

test('buildLearnedCategoryMap: leere Eingabe', () => {
  assert.equal(buildLearnedCategoryMap([]).size, 0)
})

test('buildLearnedCategoryMap: ignoriert Zeilen ohne Name oder Kategorie', () => {
  const m = buildLearnedCategoryMap([
    { counterpart_name: null, category_id: 'a' },
    { counterpart_name: 'Rewe', category_id: null },
    { counterpart_name: '   ', category_id: 'a' },
  ])
  assert.equal(m.size, 0)
})

test('buildLearnedCategoryMap: haeufigste Kategorie gewinnt, Schreibweise egal', () => {
  const m = buildLearnedCategoryMap([
    { counterpart_name: 'Rewe', category_id: 'food' },
    { counterpart_name: 'REWE ', category_id: 'food' },
    { counterpart_name: 'rewe', category_id: 'misc' },
  ])
  assert.equal(m.get('rewe'), 'food')
})

test('buildLearnedCategoryMap: Gleichstand -> zuerst gesehene Kategorie', () => {
  const m = buildLearnedCategoryMap([
    { counterpart_name: 'X', category_id: 'a' },
    { counterpart_name: 'X', category_id: 'b' },
  ])
  assert.equal(m.get('x'), 'a')
})

test('suggestCategory: gelernte Zuordnung schlaegt Keyword-Regel', () => {
  const cats = [cat('mine', 'Meine Kat'), cat('shop', 'Shopping')]
  const learned = buildLearnedCategoryMap([{ counterpart_name: 'Amazon', category_id: 'mine' }])
  assert.equal(suggestCategory('AMAZON', null, cats, learned)?.id, 'mine')
})

test('suggestCategory: gelernte Kategorie existiert nicht mehr -> kein Crash', () => {
  const learned = buildLearnedCategoryMap([{ counterpart_name: 'Foo', category_id: 'weg' }])
  assert.equal(suggestCategory('Foo', null, [cat('a')], learned), null)
})

test('suggestCategory: leere Texte ergeben null', () => {
  assert.equal(suggestCategory(null, null, [cat('a')]), null)
  assert.equal(suggestCategory('  ', '', [cat('a')]), null)
})
