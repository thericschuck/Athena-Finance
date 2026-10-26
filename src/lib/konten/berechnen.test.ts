import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abweichungVon,
  altersText,
  baueKontoZeilen,
  gruppeVon,
  gruppiereKonten,
  kontenKennzahlen,
  nachkommastellen,
  parseDezimal,
  saldoAnpassung,
  standAnzeige,
  tageSeit,
  type KontoEingabe,
} from './berechnen.ts'

const heute = new Date(2026, 9, 26, 12, 0, 0) // 26.10.2026, Mittag lokal

function konto(id: string, name: string, type: string, extra: Partial<KontoEingabe> = {}): KontoEingabe {
  return {
    id, name, type, institution: null, currency: 'EUR', color: null, iban: null, bank_iban: null,
    is_active: true, sort_order: 0, ...extra,
  }
}

test('Gruppen: Typ -> Gruppe, unbekannt -> sonstige', () => {
  assert.equal(gruppeVon('checking'), 'giro')
  assert.equal(gruppeVon('cash'), 'giro')
  assert.equal(gruppeVon('building_savings'), 'sparen')
  assert.equal(gruppeVon('crypto'), 'anlage')
  assert.equal(gruppeVon('credit'), 'sonstige')
  assert.equal(gruppeVon('irgendwas'), 'sonstige')
})

test('Abweichung: unter einem halben Cent = keine; sonst Saldo minus Summe', () => {
  assert.equal(abweichungVon(100, 100), null)
  assert.equal(abweichungVon(100.003, 100), null)
  assert.equal(abweichungVon(112.76, -3957.45), 4070.21)
  assert.equal(abweichungVon(null, 5), null)
  assert.equal(abweichungVon(5, null), null)
})

test('Zeilen: Bank-Konto bekommt Abweichung und Sync-Stand, manuelles Konto Buchungs-Stand', () => {
  const zeilen = baueKontoZeilen({
    konten: [
      konto('g', 'Girokonto', 'checking', { bank_iban: 'DE1' }),
      konto('b', 'Bauspar', 'building_savings'),
    ],
    salden: new Map([['g', 112.76], ['b', 5052.58]]),
    buchungssummen: new Map([['g', -3957.45], ['b', 5052.58]]),
    bankByIban: new Map([['DE1', { gebucht: 112.76, fetchedAt: '2026-10-26T00:00:48+00:00' }]]),
    letzteBuchung: new Map([['g', '2026-10-23'], ['b', '2026-03-09']]),
    verlauf: new Map([['g', { values: [100, 80, 112.76], first: '2026-01-01', last: '2026-10-26' }]]),
  })
  const [g, b] = zeilen
  assert.equal(g.istBank, true)
  assert.equal(g.abweichung, 4070.21)
  assert.deepEqual(g.stand, { art: 'sync', wert: '2026-10-26T00:00:48+00:00' })
  assert.equal(g.delta, 12.76)
  assert.equal(b.istBank, false)
  assert.equal(b.abweichung, null)
  assert.deepEqual(b.stand, { art: 'buchung', wert: '2026-03-09' })
  assert.equal(b.delta, null)
})

function zeilen() {
  return baueKontoZeilen({
    konten: [
      konto('g', 'Girokonto', 'checking', { sort_order: 1 }),
      konto('g2', 'Geteilt', 'checking', { sort_order: 0 }),
      konto('s', 'Bauspar', 'building_savings', { sort_order: 2 }),
      konto('d', 'Depot', 'investment', { sort_order: 3 }),
      konto('x', 'Alt', 'savings', { is_active: false, sort_order: 4 }),
      konto('c', 'Bitcoin', 'crypto', { currency: 'BTC', sort_order: 5 }),
    ],
    salden: new Map([['g', -500], ['g2', 2894.71], ['s', 5000], ['d', 1500], ['x', 10], ['c', 0.5]]),
    buchungssummen: new Map(),
    bankByIban: new Map(),
    letzteBuchung: new Map(),
    verlauf: new Map([
      ['g', { values: [0, -500], first: 'a', last: 'b' }],
      ['s', { values: [4900, 5000], first: 'a', last: 'b' }],
    ]),
  })
}

test('Gruppieren: Reihenfolge nach sort_order, Summe nur aktive EUR, Inaktive per Schalter', () => {
  const g = gruppiereKonten(zeilen(), false)
  assert.deepEqual(g.map((x) => x.key), ['giro', 'sparen', 'anlage'])
  assert.deepEqual(g[0].konten.map((k) => k.id), ['g2', 'g'])
  assert.equal(g[0].summe, 2394.71)
  assert.equal(g[1].konten.length, 1) // inaktives Sparkonto ausgeblendet
  assert.equal(g[2].summe, 1500) // BTC nicht in der EUR-Summe
  assert.equal(g[2].fremdwaehrung, 1)
  const mit = gruppiereKonten(zeilen(), true)
  assert.equal(mit.find((x) => x.key === 'sparen')?.konten.length, 2)
  assert.equal(mit.find((x) => x.key === 'sparen')?.summe, 5000) // inaktiv zählt nicht in die Summe
})

test('Kennzahlen: gesamt, liquide, gebunden, im Minus, Delta; Fremdwährung getrennt', () => {
  const k = kontenKennzahlen(zeilen())
  assert.equal(k.gesamt, 2894.71 - 500 + 5000 + 1500)
  assert.equal(k.liquide, 2394.71)
  assert.equal(k.gebunden, 6500)
  assert.equal(k.imMinus, 500)
  assert.equal(k.delta, -400)
  assert.equal(k.anzahlAktiv, 5)
  assert.equal(k.anzahlInaktiv, 1)
  assert.equal(k.fremdwaehrung, 1)
})

test('Kennzahlen: ohne Historie ist Delta null', () => {
  const k = kontenKennzahlen(
    baueKontoZeilen({
      konten: [konto('a', 'A', 'checking')],
      salden: new Map([['a', 10]]),
      buchungssummen: new Map(),
      bankByIban: new Map(),
      letzteBuchung: new Map(),
      verlauf: new Map(),
    }),
  )
  assert.equal(k.delta, null)
})

test('Frische: Tage in Berliner Zeit, Text, Ton je Art', () => {
  assert.equal(tageSeit('2026-10-26', heute), 0)
  assert.equal(tageSeit('2026-10-23', heute), 3)
  assert.equal(altersText(0), 'heute')
  assert.equal(altersText(1), 'gestern')
  assert.equal(altersText(5), 'vor 5 Tagen')
  assert.equal(altersText(231), 'vor 8 Monaten')
  assert.equal(altersText(900), 'vor 2 Jahren')
  const bauspar = standAnzeige({ art: 'buchung', wert: '2026-03-09' }, heute)
  assert.equal(bauspar?.ton, 'ok') // ein Bausparvertrag bewegt sich oft nur einmal im Jahr
  assert.match(bauspar?.text ?? '', /^Stand vor 8 Monaten$/)
  assert.equal(standAnzeige({ art: 'buchung', wert: '2025-06-01' }, heute)?.ton, 'alt')
  const sync = standAnzeige({ art: 'sync', wert: '2026-10-25T10:00:00+00:00' }, heute)
  assert.equal(sync?.ton, 'ok')
  assert.equal(standAnzeige({ art: 'sync', wert: '2026-10-20T10:00:00+00:00' }, heute)?.ton, 'alt')
  assert.equal(standAnzeige(null, heute), null)
})

test('Saldo-Anpassung: Differenz als Einnahme/Ausgabe, gleich -> null, Rundung', () => {
  assert.deepEqual(saldoAnpassung(100, 150.5), { type: 'income', amount: 50.5 })
  assert.deepEqual(saldoAnpassung(100, 40), { type: 'expense', amount: 60 })
  assert.equal(saldoAnpassung(100, 100), null)
  assert.equal(saldoAnpassung(0.1 + 0.2, 0.3), null)
  // Krypto: Bruchteile eines Cents bleiben erhalten
  assert.deepEqual(saldoAnpassung(0.4567, 0.5, nachkommastellen('BTC')), { type: 'income', amount: 0.0433 })
  assert.deepEqual(saldoAnpassung(0, 0.00012, nachkommastellen('ETH')), { type: 'income', amount: 0.00012 })
  assert.equal(nachkommastellen('EUR'), 2)
})

test('Dezimal-Eingabe: deutsche und englische Schreibweisen, Tausenderpunkt, Müll', () => {
  assert.equal(parseDezimal('1.234,56'), 1234.56)
  assert.equal(parseDezimal('1234,5'), 1234.5)
  assert.equal(parseDezimal('-12,5'), -12.5)
  assert.equal(parseDezimal('\u221212,5'), -12.5)
  assert.equal(parseDezimal('1.500'), 1500)
  assert.equal(parseDezimal('1.234.567'), 1234567)
  assert.equal(parseDezimal('1234.56'), 1234.56)
  assert.equal(parseDezimal(' 250 \u20ac '), 250)
  assert.equal(parseDezimal('0,5'), 0.5)
  assert.equal(parseDezimal(''), null)
  assert.equal(parseDezimal('-'), null)
  assert.equal(parseDezimal('abc'), null)
  assert.equal(parseDezimal('1e5'), null)
  assert.equal(parseDezimal('1,2,3'), null)
  assert.equal(parseDezimal('Infinity'), null)
})
