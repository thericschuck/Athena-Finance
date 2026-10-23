import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FlowTransaction } from '../data/flows.ts'
import { kategorieMitKindern } from '../bank/buchungen.ts'
import {
  LEERER_FILTER, filterBuchungen, gruppiereNachTag, schneideGruppen, sortiereBuchungen, summiere, vorzeichen,
} from './buchungen.ts'

let n = 0
function tx(p: Partial<FlowTransaction>): FlowTransaction {
  n += 1
  return {
    id: `t${String(n).padStart(3, '0')}`, date: '2026-10-01', type: 'expense', amount: 10, flow_kind: 'echt',
    source: 'bank_sync', account_id: 'k1', category_id: null, category_name: null,
    root_category_id: null, root_category_name: null, description: null, merchant: null, tax_role: null,
    ...p,
  }
}

const kategorien = [
  { id: 'essen', parent_id: null },
  { id: 'restaurant', parent_id: 'essen' },
  { id: 'auto', parent_id: null },
]

const liste = [
  tx({ id: 'a', date: '2026-10-02', amount: 50, merchant: 'REWE', category_id: 'essen', root_category_id: 'essen' }),
  tx({ id: 'b', date: '2026-10-02', amount: 20, merchant: 'Pizzeria', category_id: 'restaurant', root_category_id: 'essen' }),
  tx({ id: 'c', date: '2026-09-15', amount: 100, merchant: 'Tankstelle', category_id: 'auto', root_category_id: 'auto' }),
  tx({ id: 'd', date: '2026-10-01', amount: 2000, type: 'income', merchant: 'Arbeitgeber', category_id: null }),
  tx({ id: 'e', date: '2026-10-03', amount: 300, flow_kind: 'anlage', description: 'Sparplan Kraken', account_id: 'k2' }),
]
const ids = (l: readonly FlowTransaction[]) => l.map(t => t.id)

test('vorzeichen: Einnahme positiv, Ausgabe negativ', () => {
  assert.equal(vorzeichen(tx({ type: 'income', amount: 5 })), 5)
  assert.equal(vorzeichen(tx({ type: 'expense', amount: 5 })), -5)
})

test('Kategorie-Filter: Hauptkategorie nimmt Unterkategorien mit, offen = ohne Kategorie', () => {
  const menge = kategorieMitKindern('essen', kategorien)
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, kat: 'essen', katMenge: menge })), ['a', 'b'])
  // Unterkategorie allein: nur ihre eigene Buchung, nicht die der Hauptkategorie.
  assert.deepEqual(ids(filterBuchungen(liste, {
    ...LEERER_FILTER, kat: 'restaurant', katMenge: kategorieMitKindern('restaurant', kategorien),
  })), ['b'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, kat: 'offen' })), ['d', 'e'])
})

test('Kategorie-Filter ohne Menge: ueber root_category_id', () => {
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, kat: 'essen' })), ['a', 'b'])
})

test('Monat und Tag', () => {
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, monat: '2026-09' })), ['c'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, tag: '2026-10-02' })), ['a', 'b'])
})

test('Partei: ueber normalisierten Namen, auch ohne merchant (Kurztext des Zwecks)', () => {
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, partei: '  rewe ' })), ['a'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, partei: 'Sparplan Kraken' })), ['e'])
  const ohne = [tx({ id: 'x' })]
  assert.deepEqual(ids(filterBuchungen(ohne, { ...LEERER_FILTER, partei: 'Unbekannt' })), ['x'])
})

test('Typ, Art, Konto, Betragsbereich', () => {
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, typ: 'einnahmen' })), ['d'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, typ: 'ausgaben' })), ['a', 'b', 'c', 'e'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, art: 'anlage' })), ['e'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, konto: 'k2' })), ['e'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, min: 50, max: 100 })), ['a', 'c'])
})

test('Suche: Partei, Zweck, Betrag mit Komma', () => {
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, q: 'pizz' })), ['b'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, q: 'kraken' })), ['e'])
  assert.deepEqual(ids(filterBuchungen(liste, { ...LEERER_FILTER, q: '2000,00' })), ['d'])
})

test('Sortierung nach Datum, Betrag (mit Vorzeichen) und Partei', () => {
  assert.deepEqual(ids(sortiereBuchungen(liste, { feld: 'datum', richtung: 'ab' })), ['e', 'b', 'a', 'd', 'c'])
  assert.deepEqual(ids(sortiereBuchungen(liste, { feld: 'datum', richtung: 'auf' })), ['c', 'd', 'a', 'b', 'e'])
  // Groesste Einnahme oben, groesste Ausgabe unten.
  assert.deepEqual(ids(sortiereBuchungen(liste, { feld: 'betrag', richtung: 'ab' })), ['d', 'b', 'a', 'c', 'e'])
  assert.deepEqual(ids(sortiereBuchungen(liste, { feld: 'partei', richtung: 'auf' })), ['d', 'b', 'a', 'e', 'c'])
})

test('Tagesgruppen: Saldo je Tag, ohne Datum bei anderer Sortierung', () => {
  const sortiert = sortiereBuchungen(liste, { feld: 'datum', richtung: 'ab' })
  const gruppen = gruppiereNachTag(sortiert, 'datum')
  assert.deepEqual(gruppen.map(g => g.datum), ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-15'])
  assert.equal(gruppen[1].summe, -70)
  assert.equal(gruppen[2].summe, 2000)
  const einzeln = gruppiereNachTag(sortiereBuchungen(liste, { feld: 'betrag', richtung: 'ab' }), 'betrag')
  assert.equal(einzeln.length, 1)
  assert.equal(einzeln[0].datum, null)
})

test('Mehr laden: schneidet mitten im Tag, Tagessumme bleibt die des ganzen Tages', () => {
  const gruppen = gruppiereNachTag(sortiereBuchungen(liste, { feld: 'datum', richtung: 'ab' }), 'datum')
  const kurz = schneideGruppen(gruppen, 2)
  assert.equal(kurz.length, 2)
  assert.equal(kurz[1].buchungen.length, 1)
  assert.equal(kurz[1].summe, -70)
  assert.equal(schneideGruppen(gruppen, 99).length, gruppen.length)
})

test('Summen: Einnahmen, Ausgaben, Saldo', () => {
  const s = summiere(liste)
  assert.equal(s.einnahmen, 2000)
  assert.equal(s.ausgaben, 470)
  assert.equal(s.saldo, 1530)
  assert.equal(s.anzahl, 5)
  assert.deepEqual(summiere([]), { einnahmen: 0, ausgaben: 0, saldo: 0, anzahl: 0 })
})
