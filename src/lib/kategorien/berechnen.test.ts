import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baueKategorieBaum,
  filtereBaum,
  flacheListe,
  gruppiereNachRolle,
  kategorienKennzahlen,
  moeglicheEltern,
  nachkommenIds,
  normalisiere,
  nutzungJeKategorie,
  pruefeEltern,
  reihenfolgeAlsSortOrder,
  summeBaum,
  verschiebeInListe,
  zielGruppen,
  type BuchungKurz,
  type KategorieBasis,
} from './berechnen.ts'

function kat(id: string, name: string, extra: Partial<KategorieBasis> = {}): KategorieBasis {
  return {
    id, name, type: 'expense', color: null, icon: null, parent_id: null, sort_order: 0,
    budget_monthly: null, tax_role: null, euer_zeile: null, business_share: null, ...extra,
  }
}

const KATEGORIEN: KategorieBasis[] = [
  kat('wohnen', 'Wohnen', { sort_order: 1 }),
  kat('miete', 'Miete', { parent_id: 'wohnen', sort_order: 1 }),
  kat('strom', 'Strom', { parent_id: 'wohnen', sort_order: 0 }),
  kat('essen', 'Essen', { sort_order: 0, tax_role: 'privat' }),
  kat('gehalt', 'Gehalt', { type: 'income', sort_order: 2 }),
  kat('depot', 'Depot', { type: 'neutral', sort_order: 3 }),
]

function b(category_id: string | null, type: string, betrag: number, date: string, flow_kind: string | null = 'echt'): BuchungKurz {
  return { category_id, type, amount_eur: betrag, date, flow_kind }
}

test('Nutzung: Anzahl gesamt, Summe nur im Zeitraum und nur echte Fluesse', () => {
  const karte = nutzungJeKategorie(
    [
      b('miete', 'expense', 500, '2026-09-01'),
      b('miete', 'expense', 500, '2025-01-01'),
      b('miete', 'income', 20, '2026-09-02'),
      b('depot', 'expense', 100, '2026-09-03', 'anlage'),
      b('depot', 'transfer', 100, '2026-09-04', 'umbuchung'),
      b(null, 'expense', 9, '2026-09-05'),
    ],
    '2026-01-01',
  )
  assert.deepEqual(karte.get('miete'), { anzahl: 3, anzahlZeitraum: 2, ausgaben: 500, einnahmen: 20 })
  assert.deepEqual(karte.get('depot'), { anzahl: 2, anzahlZeitraum: 2, ausgaben: 0, einnahmen: 0 })
  assert.equal(karte.size, 2)
})

test('Nutzung: ohne Zeitraum (Alles) zaehlt jede Buchung', () => {
  const karte = nutzungJeKategorie([b('miete', 'expense', 5, '1999-01-01')], null)
  assert.equal(karte.get('miete')?.ausgaben, 5)
})

test('Baum: Rollup auf Hauptkategorie, Sortierung, Pfad', () => {
  const eigene = nutzungJeKategorie(
    [b('miete', 'expense', 500, '2026-09-01'), b('strom', 'expense', 40, '2026-09-02'), b('wohnen', 'expense', 10, '2026-09-03')],
    null,
  )
  const baum = baueKategorieBaum(KATEGORIEN, eigene, new Map())
  assert.deepEqual(baum.map((w) => w.id), ['essen', 'wohnen', 'gehalt', 'depot'])
  const wohnen = baum[1]
  assert.equal(wohnen.nutzung.anzahl, 3)
  assert.equal(wohnen.nutzung.ausgaben, 550)
  assert.equal(wohnen.eigene.ausgaben, 10)
  assert.deepEqual(wohnen.children.map((c) => c.id), ['strom', 'miete'])
  assert.equal(wohnen.children[0].pfad, 'Wohnen › Strom')
  assert.equal(wohnen.children[0].nutzung.ausgaben, 40)
})

test('Baum: fehlende Eltern und Zyklen machen keine Endlosschleife', () => {
  const baum = baueKategorieBaum(
    [kat('a', 'A', { parent_id: 'weg' }), kat('x', 'X', { parent_id: 'y' }), kat('y', 'Y', { parent_id: 'x' })],
    new Map(),
    new Map(),
  )
  assert.ok(baum.length >= 1)
  assert.equal(flacheListe(baum).length, 3)
})

test('Filter: Typ, Suche (Umlaute, Pfad), ungenutzt', () => {
  const eigene = nutzungJeKategorie([b('miete', 'expense', 500, '2026-09-01')], null)
  const baum = baueKategorieBaum(KATEGORIEN, eigene, new Map())

  const ausgaben = filtereBaum(baum, { typ: 'expense', suche: '', nurUngenutzte: false })
  assert.deepEqual(ausgaben.map((w) => w.id), ['essen', 'wohnen'])

  const suche = filtereBaum(baum, { typ: 'alle', suche: 'mi', nurUngenutzte: false })
  assert.deepEqual(suche.map((w) => w.id), ['wohnen'])
  assert.deepEqual(suche[0].children.map((c) => c.id), ['miete'])

  // Treffer auf die Hauptkategorie zeigt alle ihre Unterkategorien
  const haupt = filtereBaum(baum, { typ: 'alle', suche: 'wohnen', nurUngenutzte: false })
  assert.equal(haupt[0].children.length, 2)

  const ungenutzt = filtereBaum(baum, { typ: 'alle', suche: '', nurUngenutzte: true })
  assert.deepEqual(ungenutzt.map((w) => w.id), ['essen', 'wohnen', 'gehalt', 'depot'].filter((id) => id !== 'x'))
  const wohnen = ungenutzt.find((w) => w.id === 'wohnen')
  assert.deepEqual(wohnen?.children.map((c) => c.id), ['strom'])

  assert.equal(normalisiere('Müller Ärger'), normalisiere('mueller aerger'))
})

test('Rollen: Gruppen, Summen aus eigenen Buchungen ohne Doppelzaehlung', () => {
  const eigene = nutzungJeKategorie(
    [b('miete', 'expense', 500, '2026-09-01'), b('wohnen', 'expense', 10, '2026-09-02'), b('essen', 'expense', 30, '2026-09-03')],
    null,
  )
  const rollen = new Map<string, string | null>([['essen', 'privat'], ['wohnen', 'betriebsausgabe'], ['miete', 'betriebsausgabe']])
  const gruppen = gruppiereNachRolle(baueKategorieBaum(KATEGORIEN, eigene, rollen))
  assert.deepEqual(gruppen.map((g) => g.key), ['betriebsausgabe', 'privat', '__none__'])
  const betrieb = gruppen[0]
  assert.equal(betrieb.items.length, 2)
  assert.equal(betrieb.ausgaben, 510)
})

test('Kennzahlen: Haupt/Unter, ungenutzt, Ausgaben ohne Rolle', () => {
  const eigene = nutzungJeKategorie([b('miete', 'expense', 500, '2026-09-01'), b('essen', 'expense', 5, '2026-09-01')], null)
  const rollen = new Map<string, string | null>([['essen', 'privat']])
  const k = kategorienKennzahlen(baueKategorieBaum(KATEGORIEN, eigene, rollen))
  assert.equal(k.gesamt, 6)
  assert.equal(k.haupt, 4)
  assert.equal(k.unter, 2)
  // strom, gehalt, depot ungenutzt; wohnen zaehlt ueber miete als genutzt
  assert.equal(k.ungenutzt, 3)
  assert.equal(k.ausgabenOhneRolle, 1) // miete
  assert.equal(k.mitRolle, 1)
})

test('Hierarchie: Eltern pruefen, Nachkommen, moegliche Eltern', () => {
  assert.deepEqual([...nachkommenIds(KATEGORIEN, 'wohnen')].sort(), ['miete', 'strom'])
  assert.equal(pruefeEltern(KATEGORIEN, 'miete', 'essen'), null)
  assert.equal(pruefeEltern(KATEGORIEN, null, 'wohnen'), null)
  assert.match(pruefeEltern(KATEGORIEN, 'wohnen', 'wohnen') ?? '', /eigene/)
  assert.match(pruefeEltern(KATEGORIEN, 'wohnen', 'miete') ?? '', /Unterkategorie/)
  assert.match(pruefeEltern(KATEGORIEN, 'wohnen', 'essen') ?? '', /Unterkategorien/)
  assert.match(pruefeEltern(KATEGORIEN, null, 'miete') ?? '', /Hauptkategorie/)
  assert.match(pruefeEltern(KATEGORIEN, 'essen', 'unbekannt') ?? '', /nicht gefunden/)
  assert.deepEqual(moeglicheEltern(KATEGORIEN, 'wohnen'), [])
  assert.deepEqual(moeglicheEltern(KATEGORIEN, 'essen').map((k) => k.id), ['wohnen', 'gehalt', 'depot'])
  assert.deepEqual(moeglicheEltern(KATEGORIEN, 'miete').map((k) => k.id), ['wohnen', 'essen', 'gehalt', 'depot'])
})

test('Loeschziele: ohne die Kategorie und ihre Nachkommen, gruppiert', () => {
  const g = zielGruppen(KATEGORIEN, 'wohnen')
  assert.deepEqual(g.map((x) => x.wurzel.id), ['essen', 'gehalt', 'depot'])
  const g2 = zielGruppen(KATEGORIEN, 'miete')
  const wohnen = g2.find((x) => x.wurzel.id === 'wohnen')
  assert.deepEqual(wohnen?.ziele.map((z) => z.id), ['wohnen', 'strom'])
})

test('Reihenfolge: tauschen, Rand, sort_order', () => {
  assert.deepEqual(verschiebeInListe(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
  assert.deepEqual(verschiebeInListe(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'])
  assert.deepEqual(verschiebeInListe(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c'])
  assert.deepEqual(verschiebeInListe(['a', 'b'], 'x', 1), ['a', 'b'])
  assert.deepEqual(reihenfolgeAlsSortOrder(['a', 'b']), [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }])
})

test('Summe des Baums: neutrale Kategorien zaehlen nicht in Ausgaben/Einnahmen', () => {
  const eigene = nutzungJeKategorie(
    [b('miete', 'expense', 500, '2026-09-01'), b('gehalt', 'income', 3000, '2026-09-01'), b('depot', 'expense', 700, '2026-09-02')],
    null,
  )
  const s = summeBaum(baueKategorieBaum(KATEGORIEN, eigene, new Map()))
  assert.equal(s.ausgaben, 500)
  assert.equal(s.einnahmen, 3000)
  assert.equal(s.anzahl, 3)
})
