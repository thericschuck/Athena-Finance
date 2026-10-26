import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  datumsSpanne,
  decodeCsv,
  erkenneTrenner,
  leseImportText,
  parseBetrag,
  parseBetragFilter,
  parseCsvText,
  parseDatum,
  pruefeDuplikate,
  tagVerschoben,
} from './import.ts'

test('Datum: ISO, deutsch, zweistelliges Jahr, ungültige Tage', () => {
  assert.equal(parseDatum('2026-10-05'), '2026-10-05')
  assert.equal(parseDatum('2026-10-05T12:30:00'), '2026-10-05')
  assert.equal(parseDatum('05.10.2026'), '2026-10-05')
  assert.equal(parseDatum('5.1.2026'), '2026-01-05')
  assert.equal(parseDatum('01.02.26'), '2026-02-01')
  assert.equal(parseDatum('01.02.99'), '1999-02-01')
  assert.equal(parseDatum('31.02.2026'), null)
  assert.equal(parseDatum('13.13.2026'), null)
  assert.equal(parseDatum('gestern'), null)
  assert.equal(parseDatum(''), null)
})

test('Betrag: deutsch, englisch, Soll/Haben, Müll', () => {
  assert.equal(parseBetrag('-12,50'), -12.5)
  assert.equal(parseBetrag('1.234,56'), 1234.56)
  assert.equal(parseBetrag('-1234.56'), -1234.56)
  assert.equal(parseBetrag('1.234,56 S'), -1234.56)
  assert.equal(parseBetrag('1.234,56 H'), 1234.56)
  assert.equal(parseBetrag('12,50-'), -12.5)
  assert.equal(parseBetrag('+12,5 €'), 12.5)
  assert.equal(parseBetrag('0,00'), 0)
  assert.equal(parseBetrag('abc'), null)
  assert.equal(parseBetrag(''), null)
})

test('Betrag im Filter: deutsche Eingabe, leer, ungültig', () => {
  assert.equal(parseBetragFilter('12,50'), '12.5')
  assert.equal(parseBetragFilter(' 20 '), '20')
  assert.equal(parseBetragFilter('1.250,5'), '1250.5')
  assert.equal(parseBetragFilter(''), '')
  assert.equal(parseBetragFilter('-5'), null)
  assert.equal(parseBetragFilter('abc'), null)
  assert.equal(parseBetragFilter('0'), '0')
})

test('Tabelle: Anführungszeichen, doppelte Anführungszeichen, Zeilenumbruch im Feld, Leerzeilen', () => {
  const text = 'a;b;c\r\n"x;y";"sagt ""hallo""";"zwei\nZeilen"\r\n\r\n1;2;3'
  const t = parseCsvText(text)
  assert.deepEqual(t.map(r => r.felder), [
    ['a', 'b', 'c'],
    ['x;y', 'sagt "hallo"', 'zwei\nZeilen'],
    ['1', '2', '3'],
  ])
  assert.deepEqual(t.map(r => r.nr), [1, 2, 4])
})

test('Trenner: Strichpunkt gewinnt gegen Kommas in Beträgen; Komma-Datei; BOM', () => {
  assert.equal(erkenneTrenner('Datum;Betrag;Text\n01.01.2026;-1,5;a, b'), ';')
  assert.equal(erkenneTrenner('date,amount,description\n2026-01-01,-1.5,x'), ',')
  assert.equal(parseCsvText('﻿datum;betrag\n2026-01-01;5')[0].felder[0], 'datum')
})

test('Kodierung: UTF-8 mit BOM, UTF-8 ohne BOM, Windows-1252', () => {
  const utf8 = new TextEncoder().encode('Händler')
  assert.equal(decodeCsv(utf8), 'Händler')
  assert.equal(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), 'Händler')
  assert.equal(decodeCsv(new Uint8Array([0x48, 0xe4, 0x6e, 0x64, 0x6c, 0x65, 0x72])), 'Händler')
})

test('Sparkasse (CAMT): „Lastschrift Ursprungsbetrag“ ist nicht der Betrag, zweistelliges Jahr', () => {
  const csv = [
    'Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Glaeubiger ID;Mandatsreferenz;Kundenreferenz (End-to-End);Sammlerreferenz;Lastschrift Ursprungsbetrag;Auslagenersatz Ruecklastschrift;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Info',
    'DE01;02.10.26;02.10.26;KARTENZAHLUNG;REWE Markt 4711;;;;;;;REWE;DE02;XXX;-23,45;EUR;Umsatz gebucht',
    'DE01;03.10.26;03.10.26;GEHALT;Lohn Oktober;;;;;;;Firma GmbH;DE03;XXX;2.500,00;EUR;Umsatz gebucht',
  ].join('\r\n')
  const r = leseImportText(csv)
  assert.ok('zeilen' in r)
  assert.equal(r.format, 'Sparkasse')
  assert.deepEqual(r.fehler, [])
  assert.deepEqual(r.zeilen.map(z => [z.date, z.amount, z.description, z.merchant]), [
    ['2026-10-02', -23.45, 'REWE Markt 4711', 'REWE'],
    ['2026-10-03', 2500, 'Lohn Oktober', 'Firma GmbH'],
  ])
})

test('ING: Vorspann vor der Kopfzeile, zwei Währungsspalten', () => {
  const csv = [
    'Umsatzanzeige;Datei erstellt am: 01.10.2026 12:00',
    'IBAN;DE00 0000',
    'Kontoname;Girokonto',
    '',
    'Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung',
    '01.10.2026;01.10.2026;Vermieter;Dauerauftrag;Miete Oktober;1.000,00;EUR;-650,00;EUR',
  ].join('\n')
  const r = leseImportText(csv)
  assert.ok('zeilen' in r)
  assert.equal(r.format, 'ING')
  assert.deepEqual(r.zeilen.map(z => [z.nr, z.date, z.amount, z.merchant]), [[6, '2026-10-01', -650, 'Vermieter']])
})

test('Eigenes Format (Komma, Punkt-Betrag) und Fehlerzeilen mit Grund', () => {
  const csv = [
    'datum,betrag,beschreibung,haendler,kategorie',
    '2026-10-01,-1234.56,Miete,Vermieter,Wohnen',
    '2026-13-45,-5,kaputt,x,',
    '2026-10-02,abc,kein Betrag,x,',
    '2026-10-03,0,null,x,',
  ].join('\n')
  const r = leseImportText(csv)
  assert.ok('zeilen' in r)
  assert.equal(r.zeilen.length, 1)
  assert.equal(r.zeilen[0].amount, -1234.56)
  assert.equal(r.zeilen[0].category_name, 'Wohnen')
  assert.deepEqual(r.fehler.map(f => f.nr), [3, 4, 5])
  assert.match(r.fehler[0].grund, /Datum/)
  assert.match(r.fehler[1].grund, /Betrag nicht lesbar/)
  assert.match(r.fehler[2].grund, /0/)
})

test('Fremdwährung wird nicht stumm als EUR gebucht', () => {
  const r = leseImportText('Datum;Betrag;Währung\n01.10.2026;-10,00;USD\n01.10.2026;-5,00;EUR')
  assert.ok('zeilen' in r)
  assert.equal(r.zeilen.length, 1)
  assert.match(r.fehler[0].grund, /USD/)
})

test('Unbekanntes Format und leere Datei geben einen Gesamtfehler', () => {
  assert.ok(!('zeilen' in leseImportText('foo;bar\n1;2')))
  assert.ok(!('zeilen' in leseImportText('')))
})

test('Duplikate: gleiche Datei zweimal, Mehrfachbuchungen, ähnliche, neue', () => {
  const zeilen = [
    { nr: 2, date: '2026-10-01', amount: -4.5, description: 'Kaffee Bar' },
    { nr: 3, date: '2026-10-01', amount: -4.5, description: 'Kaffee Bar' },
    { nr: 4, date: '2026-10-02', amount: -20, description: 'REWE' },
    { nr: 5, date: '2026-10-03', amount: 100, description: 'Gehalt' },
  ]
  const vorhanden = [
    { date: '2026-10-01', amount: -4.5, description: 'KAFFEE BAR 123', merchant: null },
    { date: '2026-10-02', amount: -20, description: 'Kartenzahlung ohne Text-Treffer', merchant: 'Markt' },
  ]
  // Eine Kaffee-Buchung vorhanden, die zweite ist neu; REWE: gleicher Betrag, anderer Text; Gehalt neu.
  assert.deepEqual(pruefeDuplikate(zeilen, vorhanden), ['vorhanden', 'neu', 'aehnlich', 'neu'])
  // Zweiter Import derselben Datei: alles vorhanden.
  const alle = zeilen.map(z => ({ date: z.date, amount: z.amount, description: z.description }))
  assert.deepEqual(pruefeDuplikate(zeilen, alle), ['vorhanden', 'vorhanden', 'vorhanden', 'vorhanden'])
  // Vorzeichen zählt im ersten Durchgang: Einnahme gleichen Betrags ist nicht „vorhanden“.
  assert.deepEqual(pruefeDuplikate([{ nr: 2, date: '2026-10-01', amount: 4.5, description: 'Kaffee Bar' }], vorhanden), ['aehnlich'])
})

test('Datumsspanne', () => {
  assert.deepEqual(datumsSpanne([{ date: '2026-03-01' }, { date: '2026-01-05' }, { date: '2026-02-01' }]), { von: '2026-01-05', bis: '2026-03-01' })
  assert.equal(datumsSpanne([]), null)
})

test('Duplikate: Buchungstag der CSV trifft die Wertstellung der View (und umgekehrt)', () => {
  // Bank-Sync führt `date` = Wertstellung (Mo 12.), die CSV den Buchungstag (Fr 09.).
  const vorhanden = [{ date: '2026-10-12', bookedDate: '2026-10-09', amount: -50, description: 'Rewe Markt Dresden' }]
  const zeilen = [{ nr: 2, date: '2026-10-09', amount: -50, description: 'REWE Markt' }]
  assert.deepEqual(pruefeDuplikate(zeilen, vorhanden), ['vorhanden'])
  // Dieselbe Buchung zählt trotz zwei Datumsschlüsseln nur EINMAL
  assert.deepEqual(
    pruefeDuplikate(
      [{ nr: 2, date: '2026-10-09', amount: -50, description: 'REWE Markt' }, { nr: 3, date: '2026-10-12', amount: -50, description: 'REWE Markt' }],
      vorhanden,
    ),
    ['vorhanden', 'neu'],
  )
})

test('Duplikate: bis zu drei Tage daneben nur „ähnlich“, vier Tage sind neu', () => {
  const vorhanden = [{ date: '2026-10-12', amount: -20, description: 'Aral Tankstelle' }]
  const z = (date: string) => [{ nr: 2, date, amount: -20, description: 'Aral Tankstelle' }]
  assert.deepEqual(pruefeDuplikate(z('2026-10-10'), vorhanden), ['aehnlich'])
  assert.deepEqual(pruefeDuplikate(z('2026-10-15'), vorhanden), ['aehnlich'])
  assert.deepEqual(pruefeDuplikate(z('2026-10-16'), vorhanden), ['neu'])
  // anderer Text bleibt neu, auch am Nachbartag
  assert.deepEqual(pruefeDuplikate([{ nr: 2, date: '2026-10-13', amount: -20, description: 'Bäckerei' }], vorhanden), ['neu'])
})

test('Tag verschieben: Monats- und Jahresgrenzen', () => {
  assert.equal(tagVerschoben('2026-03-01', -1), '2026-02-28')
  assert.equal(tagVerschoben('2026-12-31', 1), '2027-01-01')
  assert.equal(tagVerschoben('2028-03-01', -1), '2028-02-29')
})

test('Soll/Haben: unlesbarer Text ist ein Fehler, nicht 0', () => {
  const csv = [
    'Buchungstag;Soll;Haben;Verwendungszweck',
    '01.10.2026;abc;5,00;Test',
    '02.10.2026;;7,00;Gut',
  ].join('\n')
  const r = leseImportText(csv)
  assert.ok(!('fehler' in r && typeof r.fehler === 'string'), 'Datei wird erkannt')
  if ('zeilen' in r) {
    assert.equal(r.zeilen.length, 1)
    assert.equal(r.zeilen[0].amount, 7)
    assert.equal(r.fehler.length, 1)
  }
})
