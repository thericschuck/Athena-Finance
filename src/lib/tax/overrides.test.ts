import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mischeSteuerWerte, type OverrideRow } from './overrides.ts'
import { effektiveRollen, effektiveAnteile } from './rollen.ts'

/** Gemeinsamer Baum; die Legacy-Spalten tragen ERICS Werte (so sah die Welt vor den Overrides aus). */
const BAUM = [
  { id: 'business', parent_id: null, tax_role: 'betriebsausgabe', euer_zeile: 20, business_share: null },
  { id: 'tools', parent_id: 'business', tax_role: null, euer_zeile: null, business_share: 50 },
  { id: 'haushalt', parent_id: null, tax_role: 'privat', euer_zeile: null, business_share: null },
  { id: 'leer', parent_id: null, tax_role: null, euer_zeile: null, business_share: null },
]

const ERIC: OverrideRow[] = [
  { category_id: 'business', tax_role: 'betriebsausgabe', euer_zeile: 20, business_share: null },
  { category_id: 'tools', tax_role: null, euer_zeile: null, business_share: 50 },
  { category_id: 'haushalt', tax_role: 'privat', euer_zeile: null, business_share: null },
]

const rolle = (liste: ReturnType<typeof mischeSteuerWerte>, id: string) => liste.find(k => k.id === id)

test('Override des Nutzers ersetzt die Spaltenwerte (alle drei Felder, auch NULL)', () => {
  const malik: OverrideRow[] = [{ category_id: 'business', tax_role: 'privat', euer_zeile: null, business_share: 80 }]
  const m = mischeSteuerWerte(BAUM, malik)
  assert.deepEqual(
    { r: rolle(m, 'business')?.tax_role, e: rolle(m, 'business')?.euer_zeile, a: rolle(m, 'business')?.business_share },
    { r: 'privat', e: null, a: 80 },
  )
})

test('ohne Rueckfall: fehlender Override = ungesetzt, KEIN Wert aus der Spalte eines anderen', () => {
  const m = mischeSteuerWerte(BAUM, [])
  for (const k of m) assert.deepEqual([k.tax_role, k.euer_zeile, k.business_share], [null, null, null])
})

test('leere Overrides: KEIN Rueckfall auf die Legacy-Spalten (Spaltenwerte der Kategorien werden ignoriert, dokumentiertes Verhalten)', () => {
  // BAUM traegt noch Spaltenwerte (tax_role 'betriebsausgabe', business_share 50 ...): sie duerfen nicht durchschlagen.
  const m = mischeSteuerWerte(BAUM, [])
  assert.equal(rolle(m, 'business')?.tax_role, null)
  assert.equal(rolle(m, 'business')?.euer_zeile, null)
  assert.equal(rolle(m, 'tools')?.business_share, null)
  assert.equal(rolle(m, 'haushalt')?.tax_role, null)
})

test('Eric: Merge mit seinen (backfilled) Overrides = die Werte, die vorher in den Spalten standen (Regression)', () => {
  const mitOverride = mischeSteuerWerte(BAUM, ERIC)
  const nurWerte = (l: typeof mitOverride) => l.map(k => [k.id, k.tax_role, k.euer_zeile, k.business_share])
  assert.deepEqual(nurWerte(mitOverride), BAUM.map(k => [k.id, k.tax_role, k.euer_zeile, k.business_share]))
})

test('zwei Personen, ein Baum: Vererbung rechnet je Person auf ihren Overrides', () => {
  const malik: OverrideRow[] = [{ category_id: 'business', tax_role: 'privat', euer_zeile: null, business_share: null }]
  const rollenEric = effektiveRollen(mischeSteuerWerte(BAUM, ERIC))
  const rollenMalik = effektiveRollen(mischeSteuerWerte(BAUM, malik))
  assert.equal(rollenEric.get('tools'), 'betriebsausgabe')
  assert.equal(rollenMalik.get('tools'), 'privat')
  assert.equal(rollenMalik.get('haushalt') ?? null, null)
  assert.equal(effektiveAnteile(mischeSteuerWerte(BAUM, ERIC)).get('tools'), 50)
  assert.equal(effektiveAnteile(mischeSteuerWerte(BAUM, malik)).get('tools') ?? null, null)
})

test('business_share als String (numeric aus der Datenbank) wird zur Zahl', () => {
  const o = [{ category_id: 'tools', tax_role: null, euer_zeile: null, business_share: '37.5' as unknown as number }]
  assert.equal(rolle(mischeSteuerWerte(BAUM, o), 'tools')?.business_share, 37.5)
})
