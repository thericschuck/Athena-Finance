import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestCategory, planBacklog, buildLearnedCategoryMap } from './categorize.ts'
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

// ── Regeln aus dem Rückstand von Oktober 2026 ───────────────────────────────────────────────
const alltag: FinanceCategory[] = [
  ...categories,
  kat('Lebensmittel', 'Lebenserhaltung'),
  kat('Transport', 'Lebenserhaltung'),
]

test('Baumarkt (toom) landet auf "Shopping", wie obi/bauhaus/hornbach', () => {
  assert.equal(suggestCategory('toom BM Elsenfeld', null, alltag)?.name, 'Shopping')
})

test('Getränkehändler (Kelterei) landet auf "Lebensmittel"', () => {
  assert.equal(suggestCategory('Kelterei Kuhn GmbH', null, alltag)?.name, 'Lebensmittel')
})

test('Tankstellen "OIL! 130" und Schmitt + Orschler landen auf "Transport"', () => {
  assert.equal(suggestCategory('OIL 130 Elsenfeld', null, alltag)?.name, 'Transport')
  assert.equal(suggestCategory('SCHMITT+ORSCHLER DAIMLERSTR', null, alltag)?.name, 'Transport')
})

test('"olive oil" ohne Zahl trifft die Tankstellenregel nicht', () => {
  assert.equal(suggestCategory('Delikatessen olive oil Shop', null, alltag), null)
})

test('Überweisung von einer Privatperson bleibt ohne Vorschlag, statt geraten zu werden', () => {
  assert.equal(suggestCategory('MLLE MAHBUB DILARA ERBAS', null, alltag), null)
})

// ── planBacklog ────────────────────────────────────────────────────────────────────────────
const row = (id: string, name: string, iban: string | null = null, description: string | null = null) =>
  ({ id, counterpart_name: name, counterpart_iban: iban, description })

test('planBacklog: gruppiert Buchungen je Kategorie und lässt Unbekanntes aus', () => {
  const plan = planBacklog(
    [row('1', 'toom BM Elsenfeld'), row('2', 'toom BM Elsenfeld'), row('3', 'OIL 130 Elsenfeld'), row('4', 'Privatperson X')],
    alltag, new Map(), new Set(),
  )
  assert.deepEqual(plan.get('Shopping'), ['1', '2'])
  assert.deepEqual(plan.get('Transport'), ['3'])
  assert.equal(plan.size, 2)
})

test('planBacklog: Umbuchung an ein eigenes Konto bekommt keine Kategorie, auch nicht bei Namenstreffer', () => {
  const plan = planBacklog(
    [row('1', 'toom Shopping Konto', 'DE12 3456 7890')],
    alltag, new Map(), new Set(['DE1234567890']),
  )
  assert.equal(plan.size, 0)
})

test('planBacklog: gelernte Zuordnung schlägt die Regel', () => {
  const learned = buildLearnedCategoryMap([{ counterpart_name: 'toom BM Elsenfeld', category_id: 'Lebensmittel' }])
  const plan = planBacklog([row('1', 'toom BM Elsenfeld')], alltag, learned, new Set())
  assert.deepEqual(plan.get('Lebensmittel'), ['1'])
})
