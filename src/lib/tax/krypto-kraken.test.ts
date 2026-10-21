import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneKrakenSteuer, freigrenzeFuerJahr, normalisiereAsset, ortsdatum,
  type KrakenLedgerZeile, type KrakenTradeZeile,
} from './krypto-kraken.ts'

let n = 0
const trade = (o: Partial<KrakenTradeZeile> & Pick<KrakenTradeZeile, 'side' | 'traded_at' | 'vol' | 'cost'>): KrakenTradeZeile => ({
  txid: `T${++n}`, base: 'XXBT', fee: 0, eur_kurs: 1, eur_kurs_geschaetzt: false, ...o,
})
const buch = (o: Partial<KrakenLedgerZeile> & Pick<KrakenLedgerZeile, 'type' | 'asset' | 'amount' | 'occurred_at'>): KrakenLedgerZeile => ({
  ledger_id: `L${++n}`, refid: null, subtype: null, fee: 0, ...o,
})

test('Asset-Namen: alte Praefixe, Staking-Suffixe, XBT', () => {
  assert.equal(normalisiereAsset('XXBT'), 'BTC')
  assert.equal(normalisiereAsset('XETH'), 'ETH')
  assert.equal(normalisiereAsset('ZEUR'), 'EUR')
  assert.equal(normalisiereAsset('SOL.S'), 'SOL')
  assert.equal(normalisiereAsset('ZETA'), 'ZETA') // kein altes Praefix, nicht kuerzen
  assert.equal(normalisiereAsset('XDG'), 'DOGE')
})

test('Ortsdatum: kurz nach Mitternacht deutscher Zeit ist schon der naechste Tag', () => {
  assert.equal(ortsdatum('2026-06-30T22:30:00Z'), '2026-07-01')
  assert.equal(ortsdatum('2026-01-15T10:00:00Z'), '2026-01-15')
})

test('Freigrenze: 1.000 EUR ab 2024, davor 600', () => {
  assert.equal(freigrenzeFuerJahr(2023), 600)
  assert.equal(freigrenzeFuerJahr(2024), 1000)
})

test('Kauf und Verkauf innerhalb eines Jahres: Gebuehren zaehlen, Gewinn ist steuerpflichtig', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2026-01-10T12:00:00Z', vol: 0.1, cost: 5000, fee: 10 }),
    trade({ side: 'sell', traded_at: '2026-06-10T12:00:00Z', vol: 0.1, cost: 7000, fee: 14 }),
  ], [], 2026)
  // Kosten 5010, Erloes 6986 -> Gewinn 1976, ueber der Freigrenze -> ganz steuerpflichtig
  assert.equal(r.ergebnis.saldoSteuerpflichtigEur, 1976)
  assert.equal(r.ergebnis.zuVersteuernEur, 1976)
  assert.equal(r.veraeusserungenImJahr.length, 1)
  assert.equal(r.fifo.warnungen.length, 0)
})

test('Gewinn unter der Freigrenze bleibt steuerfrei, nach einem Jahr ebenfalls', () => {
  const klein = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2026-01-10T12:00:00Z', vol: 1, cost: 1000 }),
    trade({ side: 'sell', traded_at: '2026-03-10T12:00:00Z', vol: 1, cost: 1900 }),
  ], [], 2026)
  assert.equal(klein.ergebnis.saldoSteuerpflichtigEur, 900)
  assert.equal(klein.ergebnis.zuVersteuernEur, 0)

  const lang = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2025-01-10T12:00:00Z', vol: 1, cost: 1000 }),
    trade({ side: 'sell', traded_at: '2026-02-10T12:00:00Z', vol: 1, cost: 9000 }),
  ], [], 2026)
  assert.equal(lang.ergebnis.zuVersteuernEur, 0)
  assert.equal(lang.ergebnis.steuerfreierGewinnEur, 8000)
})

test('USD-Paare werden umgerechnet und als Schaetzung gemeldet; Krypto-Quoten sind nicht bewertet', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2026-01-10T12:00:00Z', vol: 1, cost: 1100, eur_kurs: 0.9, eur_kurs_geschaetzt: true }),
    trade({ side: 'buy', base: 'XETH', traded_at: '2026-01-11T12:00:00Z', vol: 2, cost: 0.1, eur_kurs: null }),
  ], [], 2026)
  assert.equal(r.geschaetzteKurse, 1)
  assert.deepEqual(r.nichtBewertet, { anzahl: 1, assets: ['ETH'] })
  assert.equal(r.fifo.bestand.find(b => b.asset === 'BTC')?.kostenEur, 990)
  assert.ok(r.warnungen.some(w => w.includes('nicht bewertet')))
  assert.ok(r.warnungen.some(w => w.includes('USD')))
})

test('Buy Crypto ueber das Ledger (spend EUR / receive Krypto) wird zur Anschaffung', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'sell', traded_at: '2026-05-01T12:00:00Z', vol: 0.5, cost: 2000 }),
  ], [
    buch({ type: 'spend', asset: 'ZEUR', amount: -1000, fee: 5, refid: 'R1', occurred_at: '2026-02-01T09:00:00Z' }),
    buch({ type: 'receive', asset: 'XXBT', amount: 0.5, fee: 0, refid: 'R1', occurred_at: '2026-02-01T09:00:00Z' }),
  ], 2026)
  assert.equal(r.anzahlKonvertierungen, 1)
  assert.equal(r.ergebnis.saldoSteuerpflichtigEur, 995) // 2000 - 1005
  assert.equal(r.fifo.warnungen.length, 0)
})

test('Verkauf ohne bekannte Anschaffung: Fehlmenge wird gemeldet statt still zu rechnen', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'sell', traded_at: '2026-05-01T12:00:00Z', vol: 1, cost: 3000 }),
  ], [
    buch({ type: 'deposit', asset: 'XXBT', amount: 1, occurred_at: '2026-04-01T09:00:00Z' }),
  ], 2026)
  assert.ok(r.zugaengeOhneKosten.some(z => z.asset === 'BTC' && z.art === 'einzahlung'))
  assert.ok(r.warnungen.some(w => w.includes('Fehlmenge') || w.includes('fehlt die Anschaffung')))
})

test('Auszahlung und Wiedereinzahlung sind keine Veraeusserung: Datum und Kosten kommen mit zurueck', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2025-01-10T12:00:00Z', vol: 1, cost: 1000 }),
    trade({ side: 'sell', traded_at: '2026-06-10T12:00:00Z', vol: 1, cost: 5000 }),
  ], [
    buch({ type: 'withdrawal', asset: 'XXBT', amount: -1, occurred_at: '2025-03-01T09:00:00Z' }),
    buch({ type: 'deposit', asset: 'XXBT', amount: 1, occurred_at: '2026-05-01T09:00:00Z' }),
  ], 2026)
  // Haltefrist laeuft ab dem ersten Kauf (Jan 2025): Verkauf im Juni 2026 ist steuerfrei.
  assert.equal(r.ergebnis.zuVersteuernEur, 0)
  assert.equal(r.ergebnis.steuerfreierGewinnEur, 4000)
  assert.equal(r.auszahlungen[0].menge, 1)
})

test('Staking-Ertrag wird gemeldet, nicht bewertet', () => {
  const r = berechneKrakenSteuer([], [
    buch({ type: 'staking', asset: 'SOL.S', amount: 0.2, occurred_at: '2026-03-01T09:00:00Z' }),
  ], 2026)
  assert.ok(r.warnungen.some(w => w.includes('§ 22 Nr. 3')))
  assert.equal(r.zugaengeOhneKosten[0].art, 'ertrag')
})

test('Offene Lose zeigen, ab wann ein Verkauf steuerfrei ist', () => {
  const r = berechneKrakenSteuer([
    trade({ side: 'buy', traded_at: '2026-03-10T12:00:00Z', vol: 1, cost: 100 }),
  ], [], 2026)
  assert.equal(r.fifo.offeneLose[0].steuerfreiAb, '2027-03-11')
})

test('Ohne Daten: Hinweis, Nullergebnis, keine Ausnahme', () => {
  const r = berechneKrakenSteuer([], [], 2026, { historieVollstaendig: false })
  assert.equal(r.ergebnis.zuVersteuernEur, 0)
  assert.ok(r.warnungen.some(w => w.includes('noch nicht bis zum ersten Trade')))
  assert.ok(r.warnungen.some(w => w.includes('noch keine Kraken-Trades')))
})

test('Zwei Ledger-Zeilen derselben refid mit zwei Gegenseiten werden gemeldet statt geraten', () => {
  const r = berechneKrakenSteuer([], [
    buch({ type: 'spend', asset: 'ZEUR', amount: -100, refid: 'X', occurred_at: '2026-02-01T09:00:00Z' }),
    buch({ type: 'receive', asset: 'XXBT', amount: 0.001, refid: 'X', occurred_at: '2026-02-01T09:00:00Z' }),
    buch({ type: 'receive', asset: 'XETH', amount: 0.01, refid: 'X', occurred_at: '2026-02-01T09:00:00Z' }),
  ], 2026)
  assert.equal(r.anzahlKonvertierungen, 0)
  assert.equal(r.nichtBewertet.anzahl, 2)
})
