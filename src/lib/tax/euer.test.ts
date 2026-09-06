import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneEuer, type EuerBuchung, type EuerEingaben, type EuerZeileDef } from './euer.ts'
import { berechneSteuerposition, type SteuerEingaben } from './position.ts'
import { STEUERPROFIL_STANDARD } from './profil.ts'
import type { Tarif } from './tarif.ts'

/** Zeilen wie in 20260906180000_euer_zeilen.sql geseedet, auf das Nötige gekürzt. */
const Z = (jahr: number): EuerZeileDef[] => [
  { jahr, zeile: 12, bezeichnung: 'Kleinunternehmer', art: 'einnahme', sammelzeile: true,  quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 23, bezeichnung: 'Summe Betriebseinnahmen', art: 'summe', sammelzeile: false, quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 29, bezeichnung: 'Bezogene Leistungen', art: 'ausgabe', sammelzeile: false, quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 51, bezeichnung: 'Fortbildungskosten', art: 'ausgabe', sammelzeile: false, quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 60, bezeichnung: 'Uebrige Betriebsausgaben', art: 'ausgabe', sammelzeile: true, quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 75, bezeichnung: 'Summe Betriebsausgaben', art: 'summe', sammelzeile: false, quelle: 'Test', geprueft_am: '2026-09-06' },
  { jahr, zeile: 76, bezeichnung: 'Gewinn oder Verlust', art: 'ergebnis', sammelzeile: false, quelle: 'Test', geprueft_am: '2026-09-06' },
]

let laufend = 0
const b = (kat: string, betrag: number, datum = '2026-05-01'): EuerBuchung => ({
  id: `tx-${++laufend}`, datum, betrag, kategorie_id: kat, kategorie: kat, beschreibung: null,
})

// Erics Baum: Einnahmen, Weiterbildung (eigene Zeile), Tools (keine Zeile).
const ROLLEN = new Map<string, string | null>([
  ['einnahmen', 'betriebseinnahme'],
  ['weiterbildung', 'betriebsausgabe'],
  ['tools', 'betriebsausgabe'],
  ['privat', 'privat'],
  ['ohne', null],
])
const ZEILEN = new Map<string, number | null>([
  ['einnahmen', null],        // faellt auf die Sammelzeile 12 -- fuer Kleinunternehmer richtig
  ['weiterbildung', 51],
  ['tools', null],            // faellt auf 60
  ['privat', null],
  ['ohne', null],
])

const basis: EuerEingaben = {
  jahr: 2026, zeilen: Z(2026), buchungen: [], rollen: ROLLEN, euerZeilen: ZEILEN,
}

test('Einnahmen landen in der Kleinunternehmer-Zeile', () => {
  const r = berechneEuer({ ...basis, buchungen: [b('einnahmen', 480), b('einnahmen', 300)] })
  assert.equal(r.einnahmen.length, 1)
  assert.equal(r.einnahmen[0].zeile, 12)
  assert.equal(r.einnahmen[0].betrag, 780)
  assert.equal(r.einnahmen[0].buchungen.length, 2)
})

test('Ausgaben werden positiv gefuehrt, wie im Formular', () => {
  const r = berechneEuer({ ...basis, buchungen: [b('weiterbildung', -1190)] })
  assert.equal(r.ausgaben[0].zeile, 51)
  assert.equal(r.ausgaben[0].betrag, 1190)
})

test('eine Kategorie mit eigener Zeile geht dorthin, eine ohne in die Sammelzeile', () => {
  const r = berechneEuer({
    ...basis,
    buchungen: [b('weiterbildung', -1190), b('tools', -25), b('tools', -25)],
  })
  const nachZeile = new Map(r.ausgaben.map(z => [z.zeile, z.betrag]))
  assert.equal(nachZeile.get(51), 1190)
  assert.equal(nachZeile.get(60), 50)
  assert.deepEqual(r.in_sammelzeile, [{ kategorie: 'tools', betrag: 50, zeile: 60 }])
  assert.ok(r.warnungen.some(w => w.includes('Sammelzeile')))
})

test('Buchungen ohne steuerliche Rolle kommen nicht ins Formular', () => {
  const r = berechneEuer({
    ...basis,
    buchungen: [b('einnahmen', 480), b('privat', -80), b('ohne', 720), b(null as unknown as string, -10)],
  })
  assert.equal(r.summe_einnahmen?.betrag, 480)
  assert.equal(r.summe_ausgaben?.betrag, 0)
})

test('Summen- und Ergebniszeilen', () => {
  const r = berechneEuer({
    ...basis,
    buchungen: [b('einnahmen', 2937.5), b('weiterbildung', -3570), b('tools', -356.41)],
  })
  assert.equal(r.summe_einnahmen?.zeile, 23)
  assert.equal(r.summe_einnahmen?.betrag, 2937.5)
  assert.equal(r.summe_ausgaben?.zeile, 75)
  assert.equal(r.summe_ausgaben?.betrag, 3926.41)
  assert.equal(r.ergebnis?.zeile, 76)
  assert.equal(r.ergebnis?.betrag, -988.91)
})

test('leere Zeilen werden nicht ausgegeben', () => {
  const r = berechneEuer({ ...basis, buchungen: [b('einnahmen', 100)] })
  assert.equal(r.ausgaben.length, 0)
  assert.equal(r.einnahmen.length, 1)
})

test('eine Ausgabenkategorie, die auf eine Einnahmenzeile zeigt, fliesst nicht dorthin', () => {
  // Konfigurationsfehler: Zeile 12 ist eine Einnahmenzeile.
  const r = berechneEuer({
    ...basis,
    buchungen: [b('tools', -40)],
    euerZeilen: new Map([...ZEILEN, ['tools', 12]]),
  })
  assert.equal(r.einnahmen.length, 0)
  assert.equal(r.ausgaben[0].zeile, 60)   // faellt in die Sammelzeile ihrer Art
})

test('eine unbekannte Zeilennummer faellt in die Sammelzeile', () => {
  const r = berechneEuer({
    ...basis,
    buchungen: [b('tools', -40)],
    euerZeilen: new Map([...ZEILEN, ['tools', 999]]),
  })
  assert.equal(r.ausgaben[0].zeile, 60)
})

test('fehlendes Zeilenjahr: rechnen und sagen, womit', () => {
  const r = berechneEuer({ ...basis, jahr: 2027, zeilen: Z(2025), buchungen: [b('einnahmen', 100)] })
  assert.equal(r.zeilen_jahr, 2025)
  assert.ok(r.warnungen.some(w => w.includes('2027') && w.includes('2025')))
})

test('ohne Zeilendefinitionen wird nichts erfunden', () => {
  const r = berechneEuer({ ...basis, zeilen: [], buchungen: [b('einnahmen', 100)] })
  assert.equal(r.einnahmen.length, 0)
  assert.equal(r.summe_einnahmen, null)
  assert.equal(r.ergebnis, null)
  assert.ok(r.warnungen.some(w => w.includes('keine EUER-Zeilen')))
})

test('unklare Summenzeilen: keine Summe statt einer in der falschen Zeile', () => {
  // Beide Summenzeilen hinter den Ausgaben -- die Zuordnung ist nicht ableitbar.
  const kaputt = Z(2026).map(z => (z.zeile === 23 ? { ...z, zeile: 80 } : z))
  const r = berechneEuer({ ...basis, zeilen: kaputt, buchungen: [b('einnahmen', 100)] })
  assert.equal(r.summe_einnahmen, null)
  assert.equal(r.summe_ausgaben, null)
  assert.ok(r.warnungen.some(w => w.includes('Summenzeilen')))
})

// ── Die Kopplung, auf die es ankommt ────────────────────────────────────────

const T2026: Tarif = {
  jahr: 2026, grundfreibetrag: 12_348,
  zone2_bis: 17_799, zone2_faktor: 914.51, zone2_konstante: 1400,
  zone3_bis: 69_878, zone3_faktor: 173.1, zone3_konstante: 2397, zone3_sockel: 1034.87,
  zone4_bis: 277_825, zone4_satz: 0.42, zone4_abzug: 11_135.63,
  zone5_satz: 0.45, zone5_abzug: 19_470.38,
  werbungskostenpauschale: 1230, sonderausgabenpauschale: 36,
  soli_freigrenze: null, kleinunternehmer_vorjahr: 25_000, kleinunternehmer_laufend: 100_000,
  quelle: 'Test', geprueft_am: '2026-09-06',
}

test('die Ergebniszeile ist derselbe Gewinn wie in der Steuerposition', () => {
  // Dieselben Buchungen durch beide Rechenwege. Laufen sie auseinander, zeigt
  // die EUER-Seite einen anderen Gewinn als die Steuerseite -- und niemand
  // weiss, welcher gilt.
  const buchungen = [
    b('einnahmen', 2937.5), b('weiterbildung', -3570), b('tools', -356.41),
    b('privat', -500), b('ohne', 720),          // duerfen in KEINE der beiden Rechnungen
  ]

  const euer = berechneEuer({ ...basis, buchungen })

  const einnahmen = buchungen
    .filter(x => ROLLEN.get(x.kategorie_id!) === 'betriebseinnahme')
    .reduce((s, x) => s + x.betrag, 0)
  const ausgaben = buchungen
    .filter(x => ROLLEN.get(x.kategorie_id!) === 'betriebsausgabe')
    .reduce((s, x) => s - x.betrag, 0)

  const position: SteuerEingaben = {
    jahr: 2026, tarif: T2026,
    betriebseinnahmen: einnahmen, betriebsausgaben: ausgaben,
    lohnNettoImJahr: 0, monateMitLohn: 0,
    profil: { ...STEUERPROFIL_STANDARD }, umsatzVorjahr: 0,
    ruecklageIst: null, unzugeordnet: [],
  }
  const steuer = berechneSteuerposition(position)

  assert.equal(euer.ergebnis?.betrag, steuer.betrieb.gewinn)
  assert.equal(euer.summe_einnahmen?.betrag, steuer.betrieb.einnahmen)
  assert.equal(euer.summe_ausgaben?.betrag, steuer.betrieb.ausgaben)
})

test('jede Betriebsbuchung landet in genau einer Zeile', () => {
  const buchungen = [
    b('einnahmen', 480), b('einnahmen', 300),
    b('weiterbildung', -1190), b('tools', -25), b('tools', -40),
  ]
  const r = berechneEuer({ ...basis, buchungen })
  const gezaehlt = [...r.einnahmen, ...r.ausgaben].reduce((s, z) => s + z.buchungen.length, 0)
  assert.equal(gezaehlt, buchungen.length)
})
