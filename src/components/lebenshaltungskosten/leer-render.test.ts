import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const hier = path.dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url, {
  alias: { '@': path.resolve(hier, '../..') },
  jsx: { runtime: 'automatic' },
  moduleCache: false,
  interopDefault: true,
})
const { renderToStaticMarkup } = (await jiti.import('react-dom/server')) as { renderToStaticMarkup: (n: unknown) => string }
const { createElement: h } = (await jiti.import('react')) as { createElement: (...a: unknown[]) => unknown }
const { OverviewTab } = (await jiti.import(path.join(hier, 'OverviewTab.tsx'))) as { OverviewTab: (p: object) => unknown }

const SCHLECHT = /NaN|undefined|Invalid Date|Infinity/
const kat = [{ id: 'k1', name: 'Wohnen', icon: null, monthly_budget: null, sort_order: 1 }]

test('Budget-Uebersicht ohne Posten: Leerzustand statt 0,00-Euro-Karten', () => {
  const html = renderToStaticMarkup(h(OverviewTab, { categories: kat, items: [], target: null }))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Noch keine Posten im Budget/)
  assert.doesNotMatch(html, /Mindestgehalt-Kalkulation/)
})

test('Budget-Uebersicht mit Posten zum Preis 0: keine NaN-Breite in der Kompositionsleiste', () => {
  const items = [{ id: 'i1', category_id: 'k1', name: 'Gratis', unit_price: 0, quantity: 1, interval_days: 30, notes: null }]
  const html = renderToStaticMarkup(h(OverviewTab, { categories: kat, items, target: null }))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Mindestgehalt/)
})

test('Budget-Uebersicht mit Daten zeigt weiter die Kalkulation (Regression)', () => {
  const items = [{ id: 'i1', category_id: 'k1', name: 'Miete', unit_price: 900, quantity: 1, interval_days: 30, notes: null }]
  const html = renderToStaticMarkup(h(OverviewTab, { categories: kat, items, target: null }))
  assert.doesNotMatch(html, SCHLECHT)
  assert.match(html, /Mindestgehalt-Kalkulation/)
  assert.doesNotMatch(html, /Noch keine Posten/)
})
