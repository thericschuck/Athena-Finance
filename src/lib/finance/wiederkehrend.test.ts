import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erkenneWiederkehrend, normalisiere, type WiederkehrBuchung } from './wiederkehrend.ts'

/**
 * Die Testfälle sind an Erics echten Buchungstexten gebaut. Der Schwerpunkt
 * liegt auf dem, was NICHT gefunden werden darf: jeder Treffer wird ihm als
 * Vertragsvorschlag vorgelegt, und ein Stapel voller Fehlgriffe ist schlimmer
 * als keiner.
 */

let n = 0
const buchung = (
  text: string,
  betrag: number,
  datum: string,
): WiederkehrBuchung => ({
  id: `tx-${++n}`, datum, betrag,
  beschreibung: text, merchant: null,
  konto_id: 'konto-1', kategorie_id: 'kat-1',
})

/** Monatsserie am gegebenen Tag. */
const serie = (text: string, betrag: number, monate: string[], tag = '15') =>
  monate.map(m => buchung(text, betrag, `${m}-${tag}`))

test('Verwendungszwecke werden auf ihren Kern reduziert', () => {
  // Dieselbe Abbuchung, drei Monate, drei verschiedene Rechnungsnummern.
  assert.equal(
    normalisiere('Webseite Groove Control.Rechnung: 2026-00304'),
    normalisiere('Webseite Groove Control.Rechnung: 2026-00311'),
  )
  // Ziffern verschwinden, Fuellwoerter auch.
  assert.equal(normalisiere('MySales Consulting Betreuung'), 'mysales consulting betreuung')
  assert.equal(normalisiere(null), '')
  assert.equal(normalisiere('2026 00304'), '')
})

test('eine saubere Monatsserie wird erkannt', () => {
  const k = erkenneWiederkehrend(
    serie('CLAUDE AI', -25, ['2026-04', '2026-05', '2026-06', '2026-07'], '22'),
    [],
    '2026-08-01',
  )
  assert.equal(k.length, 1)
  assert.equal(k[0].frequenz, 'monthly')
  assert.equal(k[0].betrag, 25)
  assert.equal(k[0].richtung, 'ausgabe')
  assert.equal(k[0].tag_im_monat, 22)
  assert.equal(k[0].anzahl, 4)
  assert.equal(k[0].konfidenz, 'hoch')
  assert.equal(k[0].laeuft_noch, true)
  assert.equal(k[0].jahreskosten, 304.17)   // 25 * 365/30
})

test('zwei Buchungen sind keine Serie', () => {
  const k = erkenneWiederkehrend(serie('CLAUDE AI', -25, ['2026-05', '2026-06']), [], '2026-07-01')
  assert.equal(k.length, 0)
})

test('schwankende Betraege beim selben Haendler sind keine Serie', () => {
  // Der Wocheneinkauf: gleicher Text, jedes Mal ein anderer Betrag.
  const k = erkenneWiederkehrend([
    buchung('REWE Markt', -42.13, '2026-05-04'),
    buchung('REWE Markt', -87.55, '2026-05-11'),
    buchung('REWE Markt', -21.09, '2026-05-18'),
    buchung('REWE Markt', -63.40, '2026-05-25'),
  ], [], '2026-06-01')
  assert.equal(k.length, 0)
})

test('eine moderate Preiserhoehung zerlegt die Serie nicht', () => {
  const k = erkenneWiederkehrend([
    buchung('Supabase Pro', -25, '2026-03-10'),
    buchung('Supabase Pro', -25, '2026-04-10'),
    buchung('Supabase Pro', -27, '2026-05-10'),
    buchung('Supabase Pro', -27, '2026-06-10'),
  ], [], '2026-07-01')
  assert.equal(k.length, 1)
  assert.equal(k[0].betrag, 26)          // Median
  assert.equal(k[0].betrag_schwankt, true)
  assert.ok(k[0].begruendung.includes('schwankt'))
})

test('unregelmaessige Abstaende sind kein Rhythmus', () => {
  // Vier Zahlungen in zwei Wochen, dann Pause -- derselbe Median wie ein
  // Monatsrhythmus, aber kein Rhythmus.
  const k = erkenneWiederkehrend([
    buchung('Irgendwas Shop', -30, '2026-01-02'),
    buchung('Irgendwas Shop', -30, '2026-01-04'),
    buchung('Irgendwas Shop', -30, '2026-01-06'),
    buchung('Irgendwas Shop', -30, '2026-04-20'),
  ], [], '2026-05-01')
  assert.equal(k.length, 0)
})

test('quartalsweise und jaehrlich werden unterschieden', () => {
  const quartal = erkenneWiederkehrend([
    buchung('Versicherung Haftpflicht', -89, '2026-01-05'),
    buchung('Versicherung Haftpflicht', -89, '2026-04-05'),
    buchung('Versicherung Haftpflicht', -89, '2026-07-05'),
  ], [], '2026-08-01')
  assert.equal(quartal[0].frequenz, 'quarterly')

  const jahr = erkenneWiederkehrend([
    buchung('Domain Verlaengerung', -15, '2024-03-01'),
    buchung('Domain Verlaengerung', -15, '2025-03-01'),
    buchung('Domain Verlaengerung', -15, '2026-03-01'),
  ], [], '2026-04-01')
  assert.equal(jahr[0].frequenz, 'yearly')
})

test('Einnahmen werden als solche erkannt und nicht mit Ausgaben vermischt', () => {
  const k = erkenneWiederkehrend([
    ...serie('Lohn Gehalt', 578.4, ['2026-04', '2026-05', '2026-06'], '27'),
    ...serie('Lohn Gehalt', -578.4, ['2026-04', '2026-05', '2026-06'], '02'),
  ], [], '2026-07-01')
  assert.equal(k.length, 2)
  assert.deepEqual(new Set(k.map(x => x.richtung)), new Set(['einnahme', 'ausgabe']))
})

test('eine abgelaufene Serie wird gefunden, aber als beendet markiert', () => {
  const k = erkenneWiederkehrend(
    serie('Altes Abo', -9.99, ['2025-01', '2025-02', '2025-03']),
    [],
    '2026-09-06',
  )
  assert.equal(k.length, 1)
  assert.equal(k[0].laeuft_noch, false)
  assert.equal(k[0].konfidenz, 'mittel')
  assert.ok(k[0].begruendung.includes('zuletzt vor'))
})

test('was schon einen aktiven Vertrag hat, wird markiert', () => {
  const buchungen = serie('MySales Consulting Betreuung', -1190, ['2026-06', '2026-07', '2026-08'], '03')

  const ohne = erkenneWiederkehrend(buchungen, [], '2026-09-06')
  assert.equal(ohne[0].hat_vertrag, false)

  const mit = erkenneWiederkehrend(buchungen, [
    { name: 'MySales Consulting – Coaching', betrag: 1190, aktiv: true },
  ], '2026-09-06')
  assert.equal(mit[0].hat_vertrag, true)
})

test('ein inaktiver oder betragsfremder Vertrag zaehlt nicht als Treffer', () => {
  const buchungen = serie('MySales Consulting Betreuung', -1190, ['2026-06', '2026-07', '2026-08'], '03')

  const inaktiv = erkenneWiederkehrend(buchungen, [
    { name: 'MySales Consulting – Coaching', betrag: 1190, aktiv: false },
  ], '2026-09-06')
  assert.equal(inaktiv[0].hat_vertrag, false)

  const andererBetrag = erkenneWiederkehrend(buchungen, [
    { name: 'MySales Consulting – Coaching', betrag: 49, aktiv: true },
  ], '2026-09-06')
  assert.equal(andererBetrag[0].hat_vertrag, false)
})

test('der Abbuchungstag wird nur genannt, wenn er stabil ist', () => {
  const stabil = erkenneWiederkehrend([
    buchung('Fitness Studio', -29, '2026-03-03'),
    buchung('Fitness Studio', -29, '2026-04-04'),
    buchung('Fitness Studio', -29, '2026-05-03'),
  ], [], '2026-06-01')
  assert.equal(stabil[0].tag_im_monat, 3)

  // Wandert der Tag stark, wird keine Zahl behauptet.
  const wandernd = erkenneWiederkehrend([
    buchung('Wandernd GmbH', -29, '2026-03-02'),
    buchung('Wandernd GmbH', -29, '2026-04-16'),
    buchung('Wandernd GmbH', -29, '2026-05-28'),
  ], [], '2026-06-10')
  assert.equal(wandernd[0]?.tag_im_monat ?? null, null)
})

test('Kandidaten kommen nach Jahreskosten sortiert', () => {
  const k = erkenneWiederkehrend([
    ...serie('Kleines Abo', -5, ['2026-04', '2026-05', '2026-06'], '10'),
    ...serie('Grosses Abo', -200, ['2026-04', '2026-05', '2026-06'], '12'),
  ], [], '2026-07-01')
  assert.equal(k.length, 2)
  assert.equal(k[0].bezeichnung, 'Grosses Abo')
  assert.ok(k[0].jahreskosten > k[1].jahreskosten)
})

test('Buchungen ohne brauchbaren Text fallen raus statt alles zu einer Gruppe zu machen', () => {
  const k = erkenneWiederkehrend([
    buchung('12345', -20, '2026-04-01'),
    buchung('67890', -20, '2026-05-01'),
    buchung('', -20, '2026-06-01'),
  ], [], '2026-07-01')
  assert.equal(k.length, 0)
})

// ── Regressionen aus dem Lauf ueber Erics echte Buchungen ───────────────────

test('unterschiedlich abgeschnittene Haendlernamen bleiben eine Serie', () => {
  // Die Bank lieferte denselben Empfaenger in zwei Laengen. Mit vier Woertern
  // im Schluessel wurde daraus ein laufender Vertrag plus ein zweiter, der als
  // "beendet" gemeldet wurde -- ein Vorschlag, den es nie geben durfte.
  const kurz = 'Bausparkasse Schwäbisch Hall Aktiengesellschaft - Baus'
  const lang = 'Bausparkasse Schwäbisch Hall Aktiengesellschaft - Bausparkasse der Vol'
  assert.equal(normalisiere(kurz), normalisiere(lang))

  const mit = (text: string, datum: string): WiederkehrBuchung => ({
    id: `x-${datum}`, datum, betrag: -15,
    beschreibung: `21499214V03 ${datum.slice(5, 7)}.${datum.slice(0, 4)}`,
    merchant: text, konto_id: 'k', kategorie_id: 'c',
  })

  const k = erkenneWiederkehrend([
    mit(kurz, '2025-04-02'), mit(kurz, '2025-05-05'), mit(kurz, '2025-06-03'),
    mit(lang, '2025-07-02'), mit(lang, '2025-08-04'), mit(lang, '2025-09-02'),
  ], [], '2025-09-20')

  assert.equal(k.length, 1)
  assert.equal(k[0].anzahl, 6)
  assert.equal(k[0].laeuft_noch, true)
})

test('ein einzelnes kurzes Wort ist keine Identitaet', () => {
  // Ein Dauerauftrag an sich selbst hat bei der Bank den Empfaenger "Ich".
  // Daraus wurde ein Vertragsvorschlag namens "ich".
  const k = erkenneWiederkehrend([
    { id: '1', datum: '2025-03-07', betrag: -5, beschreibung: 'Savings / DA-1', merchant: 'Ich', konto_id: 'k', kategorie_id: null },
    { id: '2', datum: '2025-04-08', betrag: -5, beschreibung: 'Savings / DA-1', merchant: 'Ich', konto_id: 'k', kategorie_id: null },
    { id: '3', datum: '2025-05-08', betrag: -5, beschreibung: 'Savings / DA-1', merchant: 'Ich', konto_id: 'k', kategorie_id: null },
  ], [], '2025-06-01')
  assert.equal(k.length, 0)
})

test('ein einzelnes langes Wort dagegen schon', () => {
  const k = erkenneWiederkehrend(
    serie('Netflix', -13.99, ['2026-04', '2026-05', '2026-06'], '20'),
    [],
    '2026-07-01',
  )
  assert.equal(k.length, 1)
  assert.equal(k[0].betrag, 13.99)
})

// ── Karte/PayPal, nutzungsabhängige Abos, Betrags-Cluster, nächster Termin ──────────────────

import { naechsterTermin } from './wiederkehrend.ts'

/** Kartenzahlung wie bei der DZ Bank: Gegenpartei ist der Abwickler, der Händler steht im Verwendungszweck. */
const karte = (haendler: string, betrag: number, datum: string, kat = 'Abo'): WiederkehrBuchung => {
  const [j, m, t] = datum.split('-')
  return {
    id: `k-${++n}`, datum, betrag,
    beschreibung: `${haendler}/Musterstrasse 1/STADT/US ${t}.${m}.${j} / 14:43 OrtszeitMGST/PPSG Zahlung 23,80 USD`,
    merchant: 'DZ BANK AG', konto_id: 'konto-1', kategorie_id: 'kat-1', kategorie_name: kat,
  }
}

test('Karten-Abos: der Händler aus dem Verwendungszweck trennt, was die Gegenpartei DZ BANK vermischt', () => {
  const monate = ['2026-05', '2026-06', '2026-07', '2026-08']
  const k = erkenneWiederkehrend([
    ...monate.map(m => karte('VERCEL INC.', -21.5, `${m}-05`)),
    ...monate.map(m => karte('FIGMA INC', -23.8, `${m}-29`)),
    karte('STARBUCKS', -4.5, '2026-06-11'),
  ], [], '2026-09-01')
  assert.deepEqual(k.map(x => x.bezeichnung).sort(), ['Figma Inc', 'Vercel Inc'])
  assert.ok(k.every(x => x.ueber_abwickler && x.frequenz === 'monthly'))
})

test('Nutzungsabhängiges Abo: schwankender Betrag, aber fester Tag und Rhythmus ist ein Kandidat mit Spanne', () => {
  const betraege = [22.35, 36.56, 44, 47.91, 49.1]
  const monate = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  const k = erkenneWiederkehrend(monate.map((m, i) => karte('SUPABASE', -betraege[i], `${m}-${i % 2 ? '24' : '23'}`)), [], '2026-10-01')
  assert.equal(k.length, 1)
  assert.equal(k[0].betrag_variabel, true)
  assert.equal(k[0].betrag, 44)
  assert.deepEqual([k[0].betrag_min, k[0].betrag_max], [22.35, 49.1])
  assert.equal(k[0].konfidenz, 'mittel')
  assert.equal(k[0].tag_im_monat, 23)
})

test('Schwankende Beträge OHNE festen Tag bleiben Einkäufe, auch bei monatlichem Abstand', () => {
  const k = erkenneWiederkehrend([
    buchung('REWE Markt', -42.13, '2026-05-03'), buchung('REWE Markt', -87.55, '2026-06-17'),
    buchung('REWE Markt', -21.09, '2026-07-02'), buchung('REWE Markt', -63.4, '2026-08-26'),
    buchung('REWE Markt', -30.2, '2026-09-11'),
  ], [], '2026-10-01')
  assert.equal(k.length, 0)
})

test('Ein Abo mit einer einmaligen Zusatzbuchung bleibt ein Abo (Betrags-Cluster)', () => {
  const k = erkenneWiederkehrend([
    ...['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(m => karte('ANTHROPIC: CLAUDE TEAM', -126.44, `${m}-23`)),
    karte('ANTHROPIC: CLAUDE TEAM', -22.87, '2026-03-27'),
  ], [], '2026-08-01')
  assert.equal(k.length, 1)
  assert.equal(k[0].betrag, 126.44)
  assert.equal(k[0].anzahl, 5)
  assert.match(k[0].begruendung, /1 weitere Buchung/)
})

test('Ein Abo zwischen vielen Einkäufen beim selben Händler wird über den Betrag gefunden (Amazon Prime)', () => {
  const amazon = (betrag: number, datum: string): WiederkehrBuchung =>
    ({ ...buchung('AMZNPrime DE', betrag, datum), merchant: 'AMAZON EU S.A R.L., NIEDERLASSUNG DEUTSCHLAND' })
  const k = erkenneWiederkehrend([
    amazon(-8.99, '2026-05-16'), amazon(-34.5, '2026-05-20'), amazon(-8.99, '2026-06-16'), amazon(-12.3, '2026-06-02'),
    amazon(-8.99, '2026-07-16'), amazon(-61.0, '2026-07-21'), amazon(-8.99, '2026-08-16'), amazon(-19.99, '2026-08-05'),
  ], [], '2026-09-01')
  assert.equal(k.length, 1)
  assert.equal(k[0].betrag, 8.99)
  assert.equal(k[0].tag_im_monat, 16)
})

test('Bei nutzungsabhängigen Abos zählt für "hat Vertrag" der Name, nicht der Betrag', () => {
  const monate = ['2026-05', '2026-06', '2026-07', '2026-08']
  const buchungen = monate.map((m, i) => karte('SUPABASE', -(22 + i * 9), `${m}-23`))
  const mitVertrag = erkenneWiederkehrend(buchungen, [{ name: 'Supabase Pro', betrag: 25, aktiv: true }], '2026-09-01')
  assert.equal(mitVertrag[0].hat_vertrag, true)
})

test('Nächster Termin: im Rhythmus weiterzählen, Februar klemmen, Überfälliges markieren', () => {
  // Monatlich am 31.: nach dem 31.01. kommt der 28.02.
  assert.deepEqual(naechsterTermin('2026-01-31', 'monthly', 30, 31, '2026-02-10'), { datum: '2026-02-28', ueberfaellig: false })
  // Letzte Buchung weit zurück: auf den ersten Termin springen, der nicht mehr als 5 Tage zurückliegt
  assert.deepEqual(naechsterTermin('2026-03-05', 'monthly', 30, 5, '2026-06-20'), { datum: '2026-07-05', ueberfaellig: false })
  // Termin vor 2 Tagen: noch erwartet, aber überfällig
  assert.deepEqual(naechsterTermin('2026-05-05', 'monthly', 30, 5, '2026-06-07'), { datum: '2026-06-05', ueberfaellig: true })
  assert.equal(naechsterTermin('2025-11-10', 'yearly', 365, null, '2026-10-22').datum, '2026-11-10')
  assert.equal(naechsterTermin('2026-10-01', 'weekly', 7, null, '2026-10-22').datum, '2026-10-22')
  assert.equal(naechsterTermin('2026-07-15', 'quarterly', 91, null, '2026-10-20').datum, '2026-10-15')
})
