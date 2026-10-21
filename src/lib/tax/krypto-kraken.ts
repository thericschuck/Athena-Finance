import {
  berechneKryptoFifo,
  type Anschaffung,
  type FifoErgebnis,
  type Uebertrag,
  type JahresErgebnis,
  type Veraeusserung,
} from './krypto-fifo.ts'

/**
 * Krypto-Steuer aus der gespeicherten Kraken-Historie (Tabellen `kraken_trades` und `kraken_ledger`).
 *
 * Reine Funktion ohne Datenbank: macht aus den Zeilen die Eingaben fuer das FIFO (`krypto-fifo.ts`) und
 * sagt dazu ehrlich, was NICHT berechnet werden konnte. Eine Steuerzahl ohne diese Einschraenkungen waere
 * die eigentliche Gefahr -- deshalb stehen sie im Ergebnis, nicht in einer Fussnote.
 *
 * Quellen:
 *   Trades   Kauf und Verkauf ueber ein EUR- oder USD-Paar. Kosten = Betrag + Gebuehr, Erloes = Betrag - Gebuehr.
 *   Ledger   "Buy Crypto"/"Convert" (Typ spend/receive) taucht nicht in den Trades auf und wird ueber die
 *            gemeinsame refid zusammengesetzt, sofern die Gegenseite EUR ist. Einzahlungen, Auszahlungen und
 *            Staking-Ertraege werden nur gezaehlt und gemeldet, nicht bewertet.
 *
 * Nicht berechnet, aber gemeldet: Tausch Krypto gegen Krypto (kein EUR-Wert), USD-Paare nur mit dem Kurs
 * zum Sync-Zeitpunkt (nicht dem des Handelstags), Staking als Einkunft nach § 22 Nr. 3 EStG, Bestaende, die
 * von einer anderen Wallet eingezahlt wurden (Anschaffungsdatum und Kosten fehlen).
 *
 * Nur Kraken: Auszahlungen gelten als Uebertrag an die Wallet "extern" (Datum und Kosten wandern mit, keine
 * Veraeusserung), Einzahlungen als Uebertrag zurueck. Kommt eine Einzahlung nicht von dort, fehlt ihre
 * Anschaffung und das FIFO meldet eine Fehlmenge. Die Frage "je Wallet oder gesamt" (BMF-Schreiben vom
 * 06.03.2025) ist damit fuer Kraken allein entschieden: je Wallet.
 */

export type KrakenTradeZeile = {
  txid: string
  base: string
  side: 'buy' | 'sell'
  /** ISO-Zeitstempel, UTC. */
  traded_at: string
  vol: number
  /** Betrag in der Quote-Waehrung, ohne Gebuehr. */
  cost: number
  /** Gebuehr in der Quote-Waehrung. */
  fee: number
  /** Faktor Quote -> EUR; null, wenn die Quote weder EUR noch USD ist. */
  eur_kurs: number | null
  eur_kurs_geschaetzt: boolean
}

export type KrakenLedgerZeile = {
  ledger_id: string
  refid: string | null
  type: string
  subtype: string | null
  asset: string
  /** Mit Vorzeichen: Zugang positiv, Abgang negativ. */
  amount: number
  fee: number
  occurred_at: string
}

const FIAT = new Set(['EUR', 'USD', 'GBP', 'CAD', 'JPY', 'AUD', 'CHF'])
const LEGACY = /^(XXBT|XETH|XETC|XLTC|XMLN|XREP|XXDG|XXLM|XXMR|XXRP|XZEC|ZEUR|ZUSD|ZGBP|ZCAD|ZJPY|ZAUD|ZCHF)$/

/**
 * Kraken-Code -> Anzeigename: Staking-Suffixe (`SOL.S`, `ETH.F`) fallen weg, die Praefixe alter Codes
 * (`XXBT`, `ZEUR`) ebenso, und `XBT` heisst BTC. Beim Bestand zaehlt gestakt wie ungestakt als dasselbe Asset.
 */
export function normalisiereAsset(code: string): string {
  let c = code.replace(/\.(S|M|F|B|P|T)$/i, '')
  if (LEGACY.test(c)) c = c.slice(1)
  if (c === 'XBT') return 'BTC'
  if (c === 'XDG') return 'DOGE'
  return c
}

/** Kalendertag in deutscher Ortszeit -- fuer die Haltefrist zaehlt der Tag, nicht der UTC-Zeitpunkt. */
export function ortsdatum(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
}

/** Freigrenze fuer private Veraeusserungsgewinne: 1.000 EUR ab 2024, davor 600 EUR (§ 23 Abs. 3 EStG). */
export function freigrenzeFuerJahr(jahr: number): number {
  return jahr >= 2024 ? 1000 : 600
}

export type ZugangOhneKosten = {
  asset: string
  art: 'einzahlung' | 'ertrag'
  menge: number
  anzahl: number
  erstes: string
  letztes: string
}

export type KrakenSteuer = {
  jahr: number
  freigrenzeEur: number
  /** Ergebnis des gewaehlten Jahres; Nullwerte, wenn in dem Jahr nichts veraeussert wurde. */
  ergebnis: JahresErgebnis
  fifo: FifoErgebnis
  /** Alle Veraeusserungen des gewaehlten Jahres, neueste zuerst. */
  veraeusserungenImJahr: FifoErgebnis['veraeusserungen']
  anzahlTrades: number
  anzahlKonvertierungen: number
  /** Trades ohne EUR-Wert (Krypto gegen Krypto, andere Quote) und die betroffenen Assets. */
  nichtBewertet: { anzahl: number; assets: string[] }
  /** Trades, die mit dem Kurs zum Sync-Zeitpunkt statt dem des Handelstags umgerechnet sind. */
  geschaetzteKurse: number
  zugaengeOhneKosten: ZugangOhneKosten[]
  auszahlungen: { asset: string; menge: number; anzahl: number }[]
  warnungen: string[]
}

export type KrakenSteuerOptionen = {
  /** false = die Historie ist noch nicht bis zum ersten Trade geladen. null = unbekannt. */
  historieVollstaendig?: boolean | null
}

const WALLET = 'kraken'
const EXTERN = 'extern'
const rund = (n: number) => Math.round(n * 100) / 100

export function berechneKrakenSteuer(
  trades: KrakenTradeZeile[],
  ledger: KrakenLedgerZeile[],
  jahr: number,
  optionen: KrakenSteuerOptionen = {},
): KrakenSteuer {
  const warnungen: string[] = []
  const anschaffungen: Anschaffung[] = []
  const veraeusserungen: Veraeusserung[] = []
  const uebertraege: Uebertrag[] = []
  const nichtBewertet = new Set<string>()
  let nichtBewertetAnzahl = 0
  let geschaetzt = 0

  for (const t of trades) {
    const asset = normalisiereAsset(t.base)
    if (FIAT.has(asset)) continue // Tausch zwischen zwei Waehrungen ist kein Krypto-Geschaeft
    if (t.eur_kurs === null) { nichtBewertetAnzahl++; nichtBewertet.add(asset); continue }
    if (t.eur_kurs_geschaetzt) geschaetzt++
    const datum = ortsdatum(t.traded_at)
    const seq = Date.parse(t.traded_at) / 1000
    if (t.side === 'buy') {
      anschaffungen.push({ id: t.txid, asset, date: datum, seq, quantity: t.vol, costEur: (t.cost + t.fee) * t.eur_kurs, wallet: WALLET })
    } else {
      veraeusserungen.push({ id: t.txid, asset, date: datum, seq, quantity: t.vol, proceedsEur: Math.max(0, t.cost - t.fee) * t.eur_kurs, wallet: WALLET })
    }
  }

  // Ledger: Konvertierungen (spend/receive ueber dieselbe refid) und alles, was ohne Kosten zugeht.
  const nachRefid = new Map<string, KrakenLedgerZeile[]>()
  const zugaenge = new Map<string, ZugangOhneKosten>()
  const abgaenge = new Map<string, { asset: string; menge: number; anzahl: number }>()
  let konvertierungen = 0

  const merkeZugang = (asset: string, art: ZugangOhneKosten['art'], menge: number, wann: string) => {
    const k = `${asset}|${art}`
    const tag = ortsdatum(wann)
    const z = zugaenge.get(k)
    if (z) { z.menge += menge; z.anzahl++; if (tag < z.erstes) z.erstes = tag; if (tag > z.letztes) z.letztes = tag }
    else zugaenge.set(k, { asset, art, menge, anzahl: 1, erstes: tag, letztes: tag })
  }

  for (const l of ledger) {
    const asset = normalisiereAsset(l.asset)
    if (l.type === 'spend' || l.type === 'receive') {
      if (l.refid) nachRefid.set(l.refid, [...(nachRefid.get(l.refid) ?? []), l])
      continue
    }
    if (FIAT.has(asset)) continue
    const kopf = { id: l.ledger_id, asset, date: ortsdatum(l.occurred_at), seq: Date.parse(l.occurred_at) / 1000 }
    if (l.type === 'deposit' && l.amount > 0) {
      merkeZugang(asset, 'einzahlung', l.amount - l.fee, l.occurred_at)
      // Kam die Menge zuvor von Kraken weg (Auszahlung), kommt sie mit ihrem Datum und ihren Kosten zurueck.
      uebertraege.push({ ...kopf, quantity: l.amount - l.fee, vonWallet: EXTERN, nachWallet: WALLET })
    }
    else if (l.type === 'staking' || l.type === 'dividend' || (l.type === 'earn' && l.amount > 0 && (l.subtype ?? '') === 'reward')) {
      if (l.amount > 0) merkeZugang(asset, 'ertrag', l.amount - l.fee, l.occurred_at)
    } else if (l.type === 'withdrawal' && l.amount < 0) {
      const a = abgaenge.get(asset) ?? { asset, menge: 0, anzahl: 0 }
      a.menge += -l.amount + l.fee; a.anzahl++
      abgaenge.set(asset, a)
      // Auszahlung an eine eigene Wallet ist keine Veraeusserung: Datum und Kosten wandern mit.
      uebertraege.push({ ...kopf, quantity: -l.amount + l.fee, vonWallet: WALLET, nachWallet: EXTERN })
    }
  }

  for (const [refid, teile] of nachRefid) {
    const aus = teile.filter(x => x.type === 'spend')
    const ein = teile.filter(x => x.type === 'receive')
    if (aus.length !== 1 || ein.length !== 1) {
      // Nicht eindeutig zusammensetzbar (z. B. Teilausfuehrung ueber mehrere Zeilen): lieber melden als raten.
      for (const x of teile) { const a = normalisiereAsset(x.asset); if (!FIAT.has(a)) { nichtBewertetAnzahl++; nichtBewertet.add(a) } }
      continue
    }
    const [von, nach] = [aus[0], ein[0]]
    const vonAsset = normalisiereAsset(von.asset), nachAsset = normalisiereAsset(nach.asset)
    const datum = ortsdatum(nach.occurred_at)
    const seq = Date.parse(nach.occurred_at) / 1000
    if (vonAsset === 'EUR' && !FIAT.has(nachAsset)) {
      konvertierungen++
      anschaffungen.push({ id: refid, asset: nachAsset, date: datum, seq, quantity: nach.amount - nach.fee, costEur: -von.amount + von.fee, wallet: WALLET })
    } else if (nachAsset === 'EUR' && !FIAT.has(vonAsset)) {
      konvertierungen++
      veraeusserungen.push({ id: refid, asset: vonAsset, date: datum, seq, quantity: -von.amount + von.fee, proceedsEur: Math.max(0, nach.amount - nach.fee), wallet: WALLET })
    } else if (!FIAT.has(vonAsset) || !FIAT.has(nachAsset)) {
      nichtBewertetAnzahl++
      for (const a of [vonAsset, nachAsset]) if (!FIAT.has(a)) nichtBewertet.add(a)
    }
  }

  const fifo = berechneKryptoFifo(anschaffungen, veraeusserungen, freigrenzeFuerJahr(jahr), { verfahren: 'je-wallet', uebertraege })
  const freigrenzeEur = freigrenzeFuerJahr(jahr)
  const ergebnis: JahresErgebnis = fifo.jahre.find(j => j.jahr === jahr) ?? {
    jahr, saldoSteuerpflichtigEur: 0, steuerfreierGewinnEur: 0, freigrenzeEur, zuVersteuernEur: 0, verlustEur: 0,
  }

  // Hinweise, nach Gewicht sortiert.
  if (optionen.historieVollstaendig === false) {
    warnungen.push('Die Kraken-Historie ist noch nicht bis zum ersten Trade geladen (die Abfrage ist gedrosselt und laeuft bei jedem Sync weiter). Bis dahin fehlen Anschaffungen, und Gewinne koennen zu hoch ausfallen.')
  }
  if (trades.length === 0 && ledger.length === 0) {
    warnungen.push('Es sind noch keine Kraken-Trades gespeichert. Sie kommen mit dem naechsten Kraken-Sync (Krypto -> Synchronisieren); der API-Key braucht die Berechtigung "Query Closed Orders & Trades" und fuer Ein-/Auszahlungen "Query Ledger Entries".')
  }
  if (nichtBewertetAnzahl > 0) {
    warnungen.push(
      `${nichtBewertetAnzahl} Vorgaenge (${[...nichtBewertet].sort().join(', ')}) sind nicht bewertet, weil sie nicht gegen EUR oder USD gehandelt wurden. ` +
      'Ein Tausch von Krypto gegen Krypto ist steuerlich eine Veraeusserung UND eine Anschaffung zum Tageswert -- ohne EUR-Wert fehlt beides, Bestand und Gewinn koennen abweichen.',
    )
  }
  if (geschaetzt > 0) {
    warnungen.push(`${geschaetzt} Trades in USD sind mit dem Kurs zum Sync-Zeitpunkt statt dem des Handelstags nach EUR umgerechnet. Die Summe ist eine Schaetzung; fuer die Erklaerung braucht es den Tageskurs.`)
  }
  const ertraege = [...zugaenge.values()].filter(z => z.art === 'ertrag')
  if (ertraege.length > 0) {
    warnungen.push(
      `Staking-/Earn-Ertraege (${ertraege.map(z => `${z.menge.toLocaleString('de-DE', { maximumFractionDigits: 6 })} ${z.asset}`).join(', ')}) sind sonstige Einkuenfte nach § 22 Nr. 3 EStG ` +
      '(Freigrenze 256 EUR im Jahr) und hier NICHT bewertet. Beim spaeteren Verkauf gilt der Wert zum Zuflusszeitpunkt als Anschaffungskosten.',
    )
  }
  const einzahlungen = [...zugaenge.values()].filter(z => z.art === 'einzahlung')
  if (einzahlungen.length > 0) {
    warnungen.push(
      `Krypto wurde von ausserhalb auf Kraken eingezahlt (${einzahlungen.map(z => `${z.menge.toLocaleString('de-DE', { maximumFractionDigits: 6 })} ${z.asset}`).join(', ')}). ` +
      'Anschaffungsdatum und Kosten dieser Menge kennt Kraken nicht; werden sie verkauft, steht unten eine Fehlmenge.',
    )
  }
  warnungen.push(...fifo.warnungen)

  const veraeusserungenImJahr = fifo.veraeusserungen
    .filter(v => v.date.startsWith(`${jahr}-`))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    jahr,
    freigrenzeEur,
    ergebnis,
    fifo,
    veraeusserungenImJahr,
    anzahlTrades: trades.length,
    anzahlKonvertierungen: konvertierungen,
    nichtBewertet: { anzahl: nichtBewertetAnzahl, assets: [...nichtBewertet].sort() },
    geschaetzteKurse: geschaetzt,
    zugaengeOhneKosten: [...zugaenge.values()].map(z => ({ ...z, menge: rund(z.menge * 1e6) / 1e6 })),
    auszahlungen: [...abgaenge.values()],
    warnungen,
  }
}
