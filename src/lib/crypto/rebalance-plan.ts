// Relative Imports mit `.ts`-Endung (statt des `@/`-Alias) analog zu `src/lib/tax/position.ts` —
// die Tests laufen mit `node --experimental-strip-types` direkt, ohne Next.js-Bundler-Alias.
import { calculateRebalancing, type AssetInput, type RebalancingTarget } from './rebalancing.ts'
import type { KrakenAssetPair, KrakenTradeableAsset } from '../kraken/index.ts'

// ─── Kraken-Konstanten ──────────────────────────────────────────────────────────
// EUR bevorzugt, USD als Fallback — xStocks (VTIx & Co.) haben auf Kraken NUR ein USD-Pair,
// kein EUR-Pair. Ohne den USD-Fallback wäre für sie überhaupt kein Trade-Weg zu finden.
const CASH_CODES: Record<string, string> = { ZEUR: 'EUR', ZUSD: 'USD' }
// Kraken-Einstiegsstufe (kleinstes Handelsvolumen) für Taker-Orders — nur eine Schätzung für
// die Anzeige, kein Ersatz für Kontostufe/Volumen der letzten 30 Tage.
const DEFAULT_TAKER_FEE_PCT = 0.4

// ─── Output types ─────────────────────────────────────────────────────────────
export interface RebalanceLeg {
  pairKey:      string           // Kraken-Pair-Schlüssel, z. B. "XXBTZEUR" — direkt an AddOrder/Ticker übergebbar
  side:         'buy' | 'sell'
  route:        'direct' | 'via-eur'
  fromSymbol:   string           // Anzeige-Symbol des abgegebenen Assets ("EUR"/"USD" für Cash)
  toSymbol:     string           // Anzeige-Symbol des erhaltenen Assets
  estVolume:    number           // Menge in der Basis-Einheit des Pairs
  estEurAmount: number           // Gegenwert in EUR
  estFeeEur:    number           // geschätzte Taker-Gebühr in EUR
  // Ist die Quote-Währung des Pairs ZEUR, liefert Krakens eigene Fill-Antwort (cost/fee/price)
  // bereits echte EUR-Werte — sonst (Cross-Pair wie ETH/BTC, oder ein USD-quotierter xStock-Kauf)
  // sind sie in der Quote-Währung und die Ausführung muss auf die hier geschätzten EUR-Werte
  // zurückfallen. Steht deshalb am Leg, nicht erst bei der Ausführung neu ermittelt.
  quoteIsEur:   boolean
  // 'tokenized_asset' bei xStocks (z. B. VTIx) — Kraken verlangt bei AddOrder für diese Pairs
  // zwingend den Parameter `asset_class=tokenized_asset`, sonst kennt es den Pair-Namen nicht.
  assetClass:   'currency' | 'tokenized_asset'
}

export interface RebalancePlan {
  legs:              RebalanceLeg[]
  warnings:          string[]
  estTotalFeeEur:    number
  estTotalVolumeEur: number
}

function takerFeePct(pair: KrakenAssetPair): number {
  return pair.fees?.[0]?.[1] ?? DEFAULT_TAKER_FEE_PCT
}

/**
 * Cash-Bestand aus den gehaltenen Assets, je Kraken-Code (ZEUR/ZUSD) — kein Ziel-Asset, aber
 * Startkapital für Käufe. `current_value` ist bereits EUR-denominiert (auch für USD, per Sync),
 * deshalb hier direkt als "EUR-Gegenwert dieser Cash-Position" verwendbar.
 */
function extractCashByCode(assets: AssetInput[]): Map<string, number> {
  const codeBySymbol = new Map(Object.entries(CASH_CODES).map(([code, symbol]) => [symbol, code]))
  const result = new Map<string, number>()
  for (const a of assets) {
    const code = codeBySymbol.get((a.symbol ?? '').toUpperCase())
    if (code) result.set(code, (result.get(code) ?? 0) + (a.current_value ?? 0))
  }
  return result
}

/**
 * Sucht ein Kraken-Pair, das `fromCode` gegen `toCode` handelt — in welcher Richtung auch immer
 * Kraken es notiert. `side` sagt, welche Order-Richtung `fromCode` abgibt und `toCode` einbringt:
 * ist `fromCode` die Basis-Einheit des Pairs, ist das ein Verkauf (Basis raus, Quote rein);
 * ist `toCode` die Basis-Einheit, ist es ein Kauf (Quote raus, Basis rein). Deckt damit sowohl
 * einen direkten Cross-Pair (z. B. ETH/BTC) als auch jedes Cash-Pair mit derselben Logik ab.
 */
function findPair(
  fromCode: string, toCode: string, assetPairs: Record<string, KrakenAssetPair>,
): { pairKey: string; pair: KrakenAssetPair; side: 'buy' | 'sell' } | null {
  for (const [pairKey, pair] of Object.entries(assetPairs)) {
    if (pair.base === fromCode && pair.quote === toCode) return { pairKey, pair, side: 'sell' }
    if (pair.base === toCode && pair.quote === fromCode) return { pairKey, pair, side: 'buy' }
  }
  return null
}

/**
 * Wie `findPair`, aber probiert mehrere "Cash"-Codes in Präferenzreihenfolge (EUR vor USD) —
 * xStocks wie VTIx haben auf Kraken NUR ein USD-Pair, kein EUR-Pair.
 */
function findCashPair(
  code: string, direction: 'sell' | 'buy', assetPairs: Record<string, KrakenAssetPair>,
): { pairKey: string; pair: KrakenAssetPair; side: 'buy' | 'sell'; cashCode: string; cashSymbol: string } | null {
  for (const [cashCode, cashSymbol] of Object.entries(CASH_CODES)) {
    const found = direction === 'sell'
      ? findPair(code, cashCode, assetPairs)
      : findPair(cashCode, code, assetPairs)
    if (found) return { ...found, cashCode, cashSymbol }
  }
  return null
}

// ─── Aufsammeln vor dem Emittieren ──────────────────────────────────────────────
// Ein einzelnes Ziel-Asset kann während des Matchings aus mehreren Quellen gespeist werden
// (etwas Cash, etwas aus einem gematchten Verkauf, ein Rest danach) — würde jede Quelle sofort
// eine eigene Order auslösen, entstünden Mini-Trades, von denen der letzte oft unter Krakens
// Mindestordergröße/-volumen fällt (genau das ist Eric am 0,35-€-VTIx-Rest passiert). Deshalb
// werden gleiche Pair+Richtung-Kombinationen hier erst aufsummiert und erst danach EINMAL mit
// dem tatsächlichen Gesamtbetrag gegen die Mindestgrößen geprüft.
type PendingLeg = {
  match: { pairKey: string; pair: KrakenAssetPair; side: 'buy' | 'sell' }
  fromSymbol: string
  toSymbol: string
  route: RebalanceLeg['route']
  eurAmount: number
}

function addPending(
  pending: Map<string, PendingLeg>,
  match: { pairKey: string; pair: KrakenAssetPair; side: 'buy' | 'sell' },
  fromSymbol: string, toSymbol: string, route: RebalanceLeg['route'], eurAmount: number,
): void {
  // Nach `altname` gruppieren, nicht nach dem rohen Objekt-Key aus `AssetPairs` — Kraken listet
  // manche Pairs (mindestens xStocks) unter ZWEI verschiedenen Keys für dieselbe Order-Strecke
  // (z. B. "VTISPVUSD" und "VTIxUSD", beide altname "VTIxUSD"). Der ältere/interne Key hat sich
  // bei Eric live als der herausgestellt, den Kraken für AddOrder mit "Permission denied"
  // ablehnt — der öffentliche `altname` ist der stabile, für AddOrder verlässliche Bezeichner.
  const key = `${match.pair.altname}:${match.side}`
  const existing = pending.get(key)
  if (existing) existing.eurAmount += eurAmount
  else pending.set(key, { match, fromSymbol, toSymbol, route, eurAmount })
}

/**
 * Verkauft `code` gegen Cash. Landet die Route bei USD statt EUR (xStocks), wird zusätzlich eine
 * USD→EUR-Wechsel-Order eingeplant, damit am Ende wieder EUR in der Kasse liegt und nicht
 * unerwartet USD. Findet Kraken dafür kein Wechselkurs-Pair, bleibt der Verkauf trotzdem stehen
 * (das Geld ist ja da, nur eben vorerst in USD) — nur eine Warnung statt eines Abbruchs.
 */
function routeSellToCash(
  pending: Map<string, PendingLeg>, symbol: string, code: string, eurAmount: number,
  assetPairs: Record<string, KrakenAssetPair>, warnings: string[],
): void {
  const leg = findCashPair(code, 'sell', assetPairs)
  if (!leg) { warnings.push(`${symbol}: kein EUR/USD-Pair auf Kraken gefunden — übersprungen`); return }
  addPending(pending, leg, symbol, leg.cashSymbol, 'via-eur', eurAmount)

  if (leg.cashSymbol !== 'EUR') {
    const fx = findPair(leg.cashCode, 'ZEUR', assetPairs)
    if (fx) addPending(pending, fx, leg.cashSymbol, 'EUR', 'via-eur', eurAmount)
    else warnings.push(`Kein ${leg.cashSymbol}/EUR-Wechselkurs-Pair auf Kraken gefunden — Erlös bleibt vorerst in ${leg.cashSymbol}`)
  }
}

/**
 * Kauft `code` mit Cash. Eric hält nur EUR — führt die Route über USD (xStocks), MUSS also erst
 * EUR in USD gewandelt werden, sonst hat Kraken beim eigentlichen Kauf schlicht kein USD-Guthaben
 * zum Verrechnen. Findet sich dafür kein Wechselkurs-Pair, wird der ganze Kauf übersprungen statt
 * einer Order, die auf Kraken mangels Deckung ohnehin scheitern würde.
 */
function routeBuyFromCash(
  pending: Map<string, PendingLeg>, symbol: string, code: string, eurAmount: number,
  assetPairs: Record<string, KrakenAssetPair>, warnings: string[],
): void {
  const leg = findCashPair(code, 'buy', assetPairs)
  if (!leg) { warnings.push(`${symbol}: kein EUR/USD-Pair auf Kraken gefunden — übersprungen`); return }

  if (leg.cashSymbol !== 'EUR') {
    const fx = findPair('ZEUR', leg.cashCode, assetPairs)
    if (!fx) {
      warnings.push(`${symbol}: kein EUR/${leg.cashSymbol}-Wechselkurs-Pair auf Kraken gefunden — übersprungen`)
      return
    }
    addPending(pending, fx, 'EUR', leg.cashSymbol, 'via-eur', eurAmount)
  }
  addPending(pending, leg, leg.cashSymbol, symbol, 'via-eur', eurAmount)
}

/**
 * Deckt einen Kauf so weit wie möglich aus vorhandenem Cash — bevorzugt aus bereits gehaltenem
 * Cash IN DER ZIEL-WÄHRUNG (kein Umtausch nötig, z. B. USD, das aus einem vorherigen, teilweise
 * gescheiterten Lauf schon da ist), erst danach aus EUR-Cash (mit Umtausch, falls die
 * Ziel-Währung nicht EUR ist). Gibt den nicht gedeckten Rest zurück.
 */
function coverBuyWithAvailableCash(
  pending: Map<string, PendingLeg>, symbol: string, code: string, eurAmount: number,
  cashByCode: Map<string, number>, assetPairs: Record<string, KrakenAssetPair>, warnings: string[],
): number {
  const leg = findCashPair(code, 'buy', assetPairs)
  if (!leg) { warnings.push(`${symbol}: kein EUR/USD-Pair auf Kraken gefunden — übersprungen`); return 0 }

  let remaining = eurAmount

  const nativePool = cashByCode.get(leg.cashCode) ?? 0
  if (nativePool > 0 && remaining > 0.01) {
    const used = Math.min(nativePool, remaining)
    addPending(pending, leg, leg.cashSymbol, symbol, 'via-eur', used)
    cashByCode.set(leg.cashCode, nativePool - used)
    remaining -= used
  }

  if (remaining > 0.01 && leg.cashCode !== 'ZEUR') {
    const eurPool = cashByCode.get('ZEUR') ?? 0
    if (eurPool > 0) {
      const used = Math.min(eurPool, remaining)
      const fx = findPair('ZEUR', leg.cashCode, assetPairs)
      if (fx) {
        addPending(pending, fx, 'EUR', leg.cashSymbol, 'via-eur', used)
        addPending(pending, leg, leg.cashSymbol, symbol, 'via-eur', used)
        cashByCode.set('ZEUR', eurPool - used)
        remaining -= used
      } else {
        warnings.push(`${symbol}: kein EUR/${leg.cashSymbol}-Wechselkurs-Pair auf Kraken gefunden — Rest nicht gedeckt`)
      }
    }
  }

  return remaining
}

function pushLeg(
  match: { pairKey: string; pair: KrakenAssetPair; side: 'buy' | 'sell' },
  fromSymbol: string, toSymbol: string, route: RebalanceLeg['route'],
  eurAmount: number, priceEurByCode: Map<string, number>,
  legs: RebalanceLeg[], warnings: string[],
): void {
  const basePrice = priceEurByCode.get(match.pair.base)
  if (!basePrice || basePrice <= 0) {
    warnings.push(`${fromSymbol} → ${toSymbol}: kein Preis für die Mengenberechnung — übersprungen`)
    return
  }
  const estVolume = eurAmount / basePrice
  const ordermin  = match.pair.ordermin ? parseFloat(match.pair.ordermin) : null
  if (ordermin != null && !Number.isNaN(ordermin) && estVolume < ordermin) {
    warnings.push(
      `${fromSymbol} → ${toSymbol}: ${estVolume.toFixed(8)} unter Kraken-Mindestordergröße ` +
      `(${ordermin}) — übersprungen`,
    )
    return
  }
  // `costmin` steht in der Quote-Währung des Pairs (bei einem USD-Pair also in USD, nicht EUR) —
  // ohne die Umrechnung würde ein USD-Mindestvolumen fälschlich 1:1 gegen einen EUR-Betrag
  // geprüft, was VTIx-Käufe zu früh oder zu spät als "zu klein" hätte durchfallen lassen.
  const costmin = match.pair.costmin ? parseFloat(match.pair.costmin) : null
  if (costmin != null && !Number.isNaN(costmin)) {
    const quotePriceEur = priceEurByCode.get(match.pair.quote) ?? 1
    const costMinEur = costmin * quotePriceEur
    if (eurAmount < costMinEur) {
      warnings.push(
        `${fromSymbol} → ${toSymbol}: ${eurAmount.toFixed(2)} € unter Kraken-Mindestordervolumen ` +
        `(≈ ${costMinEur.toFixed(2)} €) — übersprungen`,
      )
      return
    }
  }
  legs.push({
    // `altname`, nicht der rohe AssetPairs-Key — siehe Kommentar in `addPending`.
    pairKey:      match.pair.altname,
    side:         match.side,
    route,
    fromSymbol,
    toSymbol,
    estVolume,
    estEurAmount: eurAmount,
    estFeeEur:    eurAmount * (takerFeePct(match.pair) / 100),
    quoteIsEur:   match.pair.quote === 'ZEUR',
    assetClass:   match.pair.aclass_base === 'tokenized_asset' ? 'tokenized_asset' : 'currency',
  })
}

/**
 * Baut aus den Ziel-Abweichungen (`calculateRebalancing`) konkrete, ausführbare Kraken-Legs.
 *
 * Reihenfolge, die Trades minimiert und Gebühren spart:
 *  1. Vorhandenes EUR-Cash deckt Käufe zuerst — braucht keinen vorherigen Verkauf, aber der
 *     Kauf-Auftrag selbst wird trotzdem angelegt (kein "kostenloser" Kauf).
 *  2. Verbleibende Verkäufe/Käufe werden gegeneinander gematcht (größte zuerst); existiert ein
 *     direktes Kraken-Pair der beiden Assets, wird EIN Trade daraus (z. B. BTC→ETH direkt statt
 *     BTC→EUR→ETH), sonst zwei Legs über Cash — EUR bevorzugt, USD als Fallback für Assets ohne
 *     eigenes EUR-Pair (xStocks wie VTIx sind auf Kraken nur gegen USD notiert; dafür wird
 *     zusätzlich eine EUR→USD-Wechsel-Order eingeplant, da Eric nur EUR hält).
 *  3. Unmatchter Verkaufs-Rest geht einzeln gegen Cash (gleiche EUR/USD-Präferenz). Unmatchter
 *     Kaufbedarf dagegen NICHT — an der Stelle ist alles Cash verplant, das ist eine echte Lücke
 *     (typischerweise Kleinstbestände in Nicht-Ziel-Coins, die in `totalValue` mitzählen) und
 *     wird als Warnung gemeldet statt als Order, die auf Kraken mangels Guthaben scheitern würde.
 *  4. Alle Legs mit demselben Kraken-Pair + derselben Richtung werden zu EINER Order
 *     zusammengefasst, bevor gegen Mindestordergröße/-volumen geprüft wird — sonst könnte ein
 *     Ziel-Asset, das aus mehreren Quellen gespeist wird, in einen winzigen letzten Rest-Trade
 *     zerfallen, der einzeln unter Krakens Minimum fällt.
 *
 * Reine Funktion — alle Kraken-Daten (Preise, Pairs, handelbare Assets, EUR/USD-Kurs) werden
 * hereingegeben, damit sie wie `calculateRebalancing()` ohne Netzwerk testbar bleibt.
 */
export function buildRebalancePlan(
  targets:         RebalancingTarget[],
  assets:          AssetInput[],
  totalValue:      number,
  threshold:       number,
  tradeableAssets: KrakenTradeableAsset[],
  assetPairs:      Record<string, KrakenAssetPair>,
  livePrices:      Record<string, number> = {},
  usdPerEur:       number = 1,
): RebalancePlan {
  const { rows } = calculateRebalancing(targets, assets, totalValue, threshold, livePrices)
  const codeByCgId = new Map(tradeableAssets.map(t => [t.dbSymbol, t.code]))

  const warnings: string[] = []
  // ZEUR/ZUSD vorab bekannt (fürs Bepreisen von Wechsel-Legs und die costmin-Umrechnung oben) —
  // alles andere kommt unten aus den Ziel-Zeilen dazu.
  const priceEurByCode = new Map<string, number>([
    ['ZEUR', 1],
    ['ZUSD', usdPerEur > 0 ? 1 / usdPerEur : 0],
  ])

  type Side = { symbol: string; code: string; eurAmount: number }
  const sells: Side[] = []
  const buys:  Side[] = []
  for (const row of rows) {
    if (row.action === 'hold') continue
    const code = codeByCgId.get(row.coingecko_id)
    if (!code) { warnings.push(`${row.symbol}: kein Kraken-Handelscode gefunden — übersprungen`); continue }
    priceEurByCode.set(code, row.current_price)
    const entry = { symbol: row.symbol, code, eurAmount: Math.abs(row.diff_eur) }
    if (row.action === 'sell') sells.push(entry); else buys.push(entry)
  }

  const pending = new Map<string, PendingLeg>()

  // 1. Cash deckt Käufe zuerst — braucht VOR keinen Verkauf, aber der Kauf selbst ist trotzdem
  // ein echter Auftrag, der auf Kraken landen muss. Frueher wurde hier nur `eurAmount`
  // heruntergezaehlt, ohne je einen Kauf-Leg dafuer anzulegen — ein Ziel-Asset, das komplett aus
  // vorhandenem Cash finanziert wird (der Normalfall direkt nach einer Einzahlung), wurde dadurch
  // still uebergangen: nur der Rest, der NICHT mehr aus Cash gedeckt war, tauchte ueberhaupt als
  // Trade auf — und genau dieser Rest ist typischerweise winzig und faellt unter Krakens
  // Mindestordervolumen (siehe die 0,35-€-VTIx-Meldung).
  //
  // `coverBuyWithAvailableCash` bevorzugt dabei Cash, das schon in der ZIEL-WÄHRUNG vorliegt
  // (z. B. USD aus einem vorherigen Lauf, dessen EUR→USD-Wechsel geklappt hat, der eigentliche
  // Kauf danach aber an einer fehlenden Kraken-Berechtigung gescheitert ist) — sonst würde ein
  // erneuter Versuch das schon vorhandene USD ignorieren und unnötig noch mehr EUR umtauschen.
  const cashByCode = extractCashByCode(assets)
  for (const b of buys) {
    b.eurAmount = coverBuyWithAvailableCash(pending, b.symbol, b.code, b.eurAmount, cashByCode, assetPairs, warnings)
  }

  // 2. Verbleibende Sells/Buys matchen — größte zuerst für möglichst wenige, große Legs.
  sells.sort((a, b) => b.eurAmount - a.eurAmount)
  buys.sort((a, b) => b.eurAmount - a.eurAmount)

  let si = 0, bi = 0
  while (si < sells.length && bi < buys.length) {
    const s = sells[si], b = buys[bi]
    if (s.eurAmount <= 0.01) { si++; continue }
    if (b.eurAmount <= 0.01) { bi++; continue }
    const matched = Math.min(s.eurAmount, b.eurAmount)

    const direct = findPair(s.code, b.code, assetPairs)
    if (direct) {
      addPending(pending, direct, s.symbol, b.symbol, 'direct', matched)
    } else {
      routeSellToCash(pending, s.symbol, s.code, matched, assetPairs, warnings)
      routeBuyFromCash(pending, b.symbol, b.code, matched, assetPairs, warnings)
    }

    s.eurAmount -= matched
    b.eurAmount -= matched
  }

  // 3a. Unmatchter Verkaufs-Rest: echter Erlös, geht gegen Cash (EUR bevorzugt, USD-Fallback).
  for (const s of sells) {
    if (s.eurAmount <= 0.01) continue
    routeSellToCash(pending, s.symbol, s.code, s.eurAmount, assetPairs, warnings)
  }
  // 3b. Unmatchter Kaufbedarf: an dieser Stelle ist alles Cash verplant (Schritt 1) und jeder
  // Verkauf gematcht (Schritt 2) — was hier noch übrig ist, hat schlicht KEINE Deckung mehr.
  // Meist ein paar Cent bis wenige Euro, weil `totalValue` auch Kleinstbestände in Coins zählt,
  // die keine Ziele sind (siehe `rebalancing.ts`) und deshalb nie verkauft werden. Dafür trotzdem
  // eine Order anzulegen würde auf Kraken mit "insufficient funds" scheitern — ehrlicher ist eine
  // Lücken-Warnung statt einer zum Scheitern verurteilten Order.
  for (const b of buys) {
    if (b.eurAmount <= 0.01) continue
    warnings.push(
      `${b.symbol}: ${b.eurAmount.toFixed(2)} € ohne Deckung (kein Cash und kein passender ` +
      'Verkauf mehr übrig, oft Kleinstbestände außerhalb der Ziel-Liste) — ausgelassen',
    )
  }

  // 4. Erst jetzt tatsächliche Legs erzeugen — gebündelt pro Pair+Richtung, siehe Docstring oben.
  const legs: RebalanceLeg[] = []
  for (const p of pending.values()) {
    pushLeg(p.match, p.fromSymbol, p.toSymbol, p.route, p.eurAmount, priceEurByCode, legs, warnings)
  }

  return {
    legs,
    warnings,
    estTotalFeeEur:    legs.reduce((sum, l) => sum + l.estFeeEur, 0),
    estTotalVolumeEur: legs.reduce((sum, l) => sum + l.estEurAmount, 0),
  }
}
