import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEERER_FILTER, filterBuchungen, gruppiereNachTag, ibanMenge, istUmbuchung, kategorieMitKindern,
  parseBetrag, schneideGruppen, sortiereBuchungen,
} from './buchungen.ts'
import type { BankTransaction } from '@/types/bank'

const tx = (id: string, datum: string, amount: number, extra: Partial<BankTransaction> = {}) =>
  ({
    id, value_date: datum, amount, created_at: `${datum}T00:00:00Z`,
    description: null, raw_description: null, counterpart_name: null, counterpart_iban: null,
    category_id: null, ...extra,
  }) as unknown as BankTransaction

const eigene = ibanMenge(['DE01 1234'])
const daten = [
  tx('1', '2026-10-01', -12.5, { counterpart_name: 'Rewe', description: 'Einkauf Markt' }),
  tx('2', '2026-10-01', -100, { counterpart_iban: 'de011234', counterpart_name: 'Eigenes Konto' }),
  tx('3', '2026-10-02', 2500, { counterpart_name: 'Arbeitgeber', category_id: 'k1' }),
  tx('4', '2026-09-30', -40, { counterpart_name: 'Aldi', category_id: 'k2' }),
]

test('Umbuchung: Gegen-IBAN wird normalisiert verglichen', () => {
  assert.equal(istUmbuchung(daten[1], eigene), true)
  assert.equal(istUmbuchung(daten[0], eigene), false)
})

test('Filter: Suche trifft Text und Betrag in beiden Schreibweisen', () => {
  const f = (q: string) => filterBuchungen(daten, { ...LEERER_FILTER, q }, eigene).map(t => t.id)
  assert.deepEqual(f('markt'), ['1'])
  assert.deepEqual(f('12,5'), ['1'])
  assert.deepEqual(f('12.50'), ['1'])
})

test('Filter: Kategorie offen, Typ, Betragsbereich, Datum, Partei', () => {
  const f = (p: Partial<typeof LEERER_FILTER>) =>
    filterBuchungen(daten, { ...LEERER_FILTER, ...p }, eigene).map(t => t.id)
  assert.deepEqual(f({ kategorie: 'offen' }), ['1', '2'])
  assert.deepEqual(f({ kategorie: 'k2' }), ['4'])
  assert.deepEqual(f({ typ: 'umbuchung' }), ['2'])
  assert.deepEqual(f({ typ: 'ausgang' }), ['1', '4'])
  assert.deepEqual(f({ typ: 'eingang' }), ['3'])
  assert.deepEqual(f({ min: 40, max: 100 }), ['2', '4'])
  assert.deepEqual(f({ von: '2026-10-01', bis: '2026-10-01' }), ['1', '2'])
  assert.deepEqual(f({ partei: 'Aldi' }), ['4'])
})

test('Sortierung: Datum, Betrag, Gegenpartei (ohne Namen ans Ende)', () => {
  const ids = (feld: 'datum' | 'betrag' | 'partei', richtung: 'auf' | 'ab') =>
    sortiereBuchungen(daten, { feld, richtung }).map(t => t.id)
  assert.equal(ids('datum', 'ab')[0], '3')
  assert.equal(ids('datum', 'auf')[0], '4')
  assert.deepEqual(ids('betrag', 'ab'), ['3', '1', '4', '2'])
  assert.deepEqual(ids('partei', 'auf'), ['4', '3', '2', '1'])
})

test('Gruppierung: Tagessumme ohne Umbuchungen, bei anderer Sortierung eine Gruppe', () => {
  const s = sortiereBuchungen(daten, { feld: 'datum', richtung: 'ab' })
  const g = gruppiereNachTag(s, 'datum', eigene)
  assert.deepEqual(g.map(x => [x.datum, x.summe]), [
    ['2026-10-02', 2500], ['2026-10-01', -12.5], ['2026-09-30', -40],
  ])
  const eine = gruppiereNachTag(s, 'betrag', eigene)
  assert.equal(eine.length, 1)
  assert.equal(eine[0].datum, null)
})

test('Mehr-laden: Schnitt mitten im Tag behaelt die Tagessumme des ganzen Tages', () => {
  const g = gruppiereNachTag(sortiereBuchungen(daten, { feld: 'datum', richtung: 'ab' }), 'datum', eigene)
  const s = schneideGruppen(g, 2)
  assert.equal(s.length, 2)
  assert.equal(s[1].buchungen.length, 1)
  assert.equal(s[1].summe, -12.5)
})

test('parseBetrag: deutsch, englisch, leer, ungueltig', () => {
  assert.equal(parseBetrag('1.234,50'), 1234.5)
  assert.equal(parseBetrag('12.5'), 12.5)
  assert.equal(parseBetrag(''), null)
  assert.equal(parseBetrag('abc'), null)
})

test('kategorieMitKindern: Kategorie plus alle Unterkategorien, beliebige Tiefe', () => {
  const k = [
    { id: 'a', parent_id: null }, { id: 'b', parent_id: 'a' }, { id: 'c', parent_id: 'b' }, { id: 'x', parent_id: null },
  ]
  assert.deepEqual([...kategorieMitKindern('a', k)].sort(), ['a', 'b', 'c'])
  assert.deepEqual([...kategorieMitKindern('x', k)], ['x'])
})
