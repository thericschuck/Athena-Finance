import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestCategory } from './categorize.ts'
import type { FinanceCategory } from '@/types/bank'

// Bildet Erics reale Kategorien nach: "Abo" mit Vendor-Unterkategorien, plus "Shopping"
// als Top-Level-Kategorie ohne Bezug zu "Abo".
function kat(name: string, parent_id: string | null = null): FinanceCategory {
  return { id: name, name, type: 'expense', color: null, icon: null, parent_id }
}

const categories: FinanceCategory[] = [
  kat('Abo'),
  kat('Claude / Anthropic', 'Abo'),
  kat('Vercel', 'Abo'),
  kat('Supabase', 'Abo'),
  kat('Figma', 'Abo'),
  kat('Amazon Prime', 'Abo'),
  kat('marbis', 'Abo'),
  kat('Sonstige Abos', 'Abo'),
  kat('Shopping'),
]

test('Anthropic-Buchung landet auf der Vendor-Unterkategorie, nicht auf "Abo"', () => {
  const treffer = suggestCategory('Anthropic PBC', null, categories)
  assert.equal(treffer?.name, 'Claude / Anthropic')
})

test('Vercel-Buchung landet auf "Vercel", nicht auf "Abo"', () => {
  const treffer = suggestCategory('Vercel Inc.', null, categories)
  assert.equal(treffer?.name, 'Vercel')
})

test('Amazon-Prime-Buchung landet auf "Amazon Prime", nicht auf "Shopping" oder "Abo"', () => {
  const treffer = suggestCategory('AMAZON PRIME DE', null, categories)
  assert.equal(treffer?.name, 'Amazon Prime')
})

test('reiner Amazon-Einkauf ohne "Prime" bleibt bei "Shopping"', () => {
  const treffer = suggestCategory('AMAZON.DE MARKETPLACE', null, categories)
  assert.equal(treffer?.name, 'Shopping')
})

test('marbis wird erkannt', () => {
  const treffer = suggestCategory('MARBIS GMBH', null, categories)
  assert.equal(treffer?.name, 'marbis')
})

test('Streaming-Dienst ohne eigene Vendor-Kategorie landet auf "Sonstige Abos"', () => {
  const treffer = suggestCategory('Spotify AB', null, categories)
  assert.equal(treffer?.name, 'Sonstige Abos')
})

test('fehlt die Vendor-Kategorie, greift der generische Business-Tools/Abo-Fallback', () => {
  const ohneVendorKategorien = categories.filter((c) => c.name !== 'Vercel')
  const treffer = suggestCategory('Vercel Inc.', null, ohneVendorKategorien)
  assert.equal(treffer?.name, 'Abo')
})
