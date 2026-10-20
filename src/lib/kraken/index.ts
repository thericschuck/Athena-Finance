/**
 * Shared Kraken API utilities.
 * Server-side only — never import in client components.
 */
import { createHash, createHmac } from 'crypto'
import { getEurUsdRate } from '@/lib/crypto/coingecko'
import { findBySymbol } from '@/lib/crypto/coin-registry'
import { KRAKEN_TO_SYMBOL, krakenCodeToSymbol } from './symbols'

export const KRAKEN_API = 'https://api.kraken.com'

// ─── Asset Code Mapping ───────────────────────────────────────────────────────
// Ausgelagert nach ./symbols (rein, ohne @/-Importe, testbar); hier re-exportiert.
export { KRAKEN_TO_SYMBOL, krakenCodeToSymbol }

export interface ResolvedKrakenAsset {
  symbol:      string           // display ticker, e.g. 'BTC'
  dbSymbol:    string           // what `syncFromKraken()` writes into assets.symbol
  name:        string
  type:        'crypto' | 'stable' | 'fiat'
  coingeckoId: string | null
}

/**
 * Resolves a Kraken code (+ its `/Assets` altname) to exactly what the sync pipeline would
 * store for it — shared by `syncFromKraken()` and `fetchKrakenTradeableAssets()` below so a
 * target/asset picked before ever syncing resolves to the identical `assets.symbol` value the
 * next real sync writes. Two separate implementations of this would drift the moment either one
 * changes (e.g. a new registry entry) and silently break the match.
 */
export function resolveKrakenAsset(code: string, altname: string | undefined): ResolvedKrakenAsset {
  const symbol = (Object.hasOwn(KRAKEN_TO_SYMBOL, code) ? KRAKEN_TO_SYMBOL[code] : undefined) ?? altname ?? krakenCodeToSymbol(code)
  const isFiat = code.startsWith('Z') && code.length <= 5
  const registryMatch = findBySymbol(symbol)
  return {
    symbol,
    dbSymbol:    registryMatch?.coingecko_id ?? symbol,
    name:        registryMatch?.name ?? symbol,
    type:        isFiat ? 'fiat' : (registryMatch?.type === 'stable' ? 'stable' : 'crypto'),
    coingeckoId: registryMatch?.coingecko_id ?? null,
  }
}

// ─── Request Signing ──────────────────────────────────────────────────────────
/**
 * Signs a Kraken private API request.
 * HMAC-SHA512( base64decode(secret), path + SHA256(nonce + postData) )
 */
export function signKrakenRequest(path: string, nonce: string, postData: string, secret: string): string {
  const sha256Payload = createHash('sha256').update(nonce + postData).digest()
  const message = Buffer.concat([Buffer.from(path), sha256Payload])
  return createHmac('sha512', Buffer.from(secret, 'base64')).update(message).digest('base64')
}

// ─── Nonce ──────────────────────────────────────────────────────────────────────
// Kraken requires every private-API request for a given key to use a strictly increasing
// nonce — across ALL endpoints, not per endpoint. A single call using a differently-scaled
// nonce (e.g. Date.now() * 1000) permanently poisons the key: every later call with a normal
// timestamp-sized nonce is then "smaller" than the last one Kraken recorded and gets rejected
// with "EAPI:Invalid nonce" forever after. One shared, monotonic generator for every private
// call in this module is the only safe way to avoid that — it also protects against two calls
// firing within the same millisecond (e.g. React Strict Mode double-invoking an effect).
let lastNonce = 0
// Exportiert, damit orders.ts (echte AddOrder-Aufrufe) denselben Zähler benutzt statt einen
// zweiten zu fuehren — zwei unabhaengige Nonce-Zaehler fuer denselben Key waeren genau das
// Problem, vor dem der Kommentar oben warnt.
export function nextNonce(): string {
  const now = Date.now()
  lastNonce = now > lastNonce ? now : lastNonce + 1
  return lastNonce.toString()
}

// ─── Balance Fetch ────────────────────────────────────────────────────────────
export interface KrakenRawBalances {
  [krakenCode: string]: string  // e.g. { XXBT: '0.50', ZEUR: '1000.00' }
}

/**
 * Calls Kraken /0/private/Balance and returns raw balances.
 * Throws on network error or Kraken API error.
 */
export async function fetchKrakenBalances(apiKey: string, apiSecret: string): Promise<KrakenRawBalances> {
  const path     = '/0/private/Balance'
  const nonce    = nextNonce()
  const postData = `nonce=${nonce}`

  const res = await fetch(`${KRAKEN_API}${path}`, {
    method:  'POST',
    headers: {
      'API-Key':      apiKey,
      'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  const json = await res.json() as { error: string[]; result?: KrakenRawBalances }

  if (json.error?.length) {
    throw new Error(json.error.join(', '))
  }

  return json.result ?? {}
}

// ─── Asset Info (public) ───────────────────────────────────────────────────────
// Kraken's own name for each code it holds — the primary symbol source for sync (replaces
// having to maintain a hardcoded code→symbol list; covers every current and future asset).
export interface KrakenAssetInfo { altname: string }

// Kraken's public endpoints default to `aclass=currency`/`aclass_base=currency` — xStocks
// (tokenized equities like VTIx) live under the separate `tokenized_asset` class and are
// silently absent unless asked for explicitly. Both fetchers below always merge the two, so
// nothing downstream (sync, the tradeable-asset picker) has to know xStocks are a second class
// of asset at all — a real Kraken holding of e.g. VTIx must resolve the same way regardless.
async function fetchKrakenAssetInfoRaw(init: RequestInit): Promise<Record<string, KrakenAssetInfo>> {
  const [currencyRes, tokenizedRes] = await Promise.all([
    fetch(`${KRAKEN_API}/0/public/Assets`, init),
    fetch(`${KRAKEN_API}/0/public/Assets?aclass=tokenized_asset`, init),
  ])
  const currency  = await currencyRes.json()  as { error: string[]; result?: Record<string, KrakenAssetInfo> }
  const tokenized = await tokenizedRes.json() as { error: string[]; result?: Record<string, KrakenAssetInfo> }
  if (currency.error?.length)  throw new Error(currency.error.join(', '))
  if (tokenized.error?.length) throw new Error(tokenized.error.join(', '))
  return { ...currency.result, ...tokenized.result }
}

export async function fetchKrakenAssetInfo(): Promise<Record<string, KrakenAssetInfo>> {
  return fetchKrakenAssetInfoRaw({ cache: 'no-store' })
}

// ─── Asset Pairs (public) ──────────────────────────────────────────────────────
// Which pairs actually exist for a code — needed before calling Ticker, since Kraken errors
// on a guessed pair name instead of returning "no data".
export interface KrakenAssetPair {
  altname: string
  base:    string
  quote:   string
  /** 'currency' für normale Krypto-/Fiat-Pairs, 'tokenized_asset' für xStocks (z. B. VTIx,
   *  AAPLx). Tokenized-Pairs brauchen bei Ticker UND AddOrder zwingend den zusätzlichen
   *  Parameter `asset_class=tokenized_asset` — ohne ihn kennt Kraken den Pair-Namen schlicht
   *  nicht ("Unknown asset pair"), siehe `fetchKrakenTickers()` unten. */
  aclass_base?: string
  /** Mindestordergröße in der Basis-Einheit — Kraken lehnt AddOrder darunter ab.
   *  Kommt in der rohen `/0/public/AssetPairs`-Antwort mit, wurde bisher aber nie
   *  ausgelesen (der `as {...}`-Cast unten wirft nichts weg, er ignoriert nur die
   *  TS-Typisierung dafür). */
  ordermin?: string
  /** Mindest-Ordervolumen in der Quote-Währung. */
  costmin?: string
  /** Taker-Gebührenstaffel: [[Volumenschwelle, Gebühr-%], ...], aufsteigend nach Volumen. */
  fees?: [number, number][]
}

async function fetchKrakenAssetPairsRaw(init: RequestInit): Promise<Record<string, KrakenAssetPair>> {
  const [currencyRes, tokenizedRes] = await Promise.all([
    fetch(`${KRAKEN_API}/0/public/AssetPairs`, init),
    fetch(`${KRAKEN_API}/0/public/AssetPairs?aclass_base=tokenized_asset`, init),
  ])
  const currency  = await currencyRes.json()  as { error: string[]; result?: Record<string, KrakenAssetPair> }
  const tokenized = await tokenizedRes.json() as { error: string[]; result?: Record<string, KrakenAssetPair> }
  if (currency.error?.length)  throw new Error(currency.error.join(', '))
  if (tokenized.error?.length) throw new Error(tokenized.error.join(', '))
  return { ...currency.result, ...tokenized.result }
}

export async function fetchKrakenAssetPairs(): Promise<Record<string, KrakenAssetPair>> {
  return fetchKrakenAssetPairsRaw({ cache: 'no-store' })
}

// ─── Tradeable assets (public, cached) ─────────────────────────────────────────
export interface KrakenTradeableAsset {
  code:     string   // Kraken's own code, e.g. 'XXBT'
  symbol:   string
  dbSymbol: string
  name:     string
  type:     'crypto' | 'stable' | 'fiat'
}

/**
 * Every Kraken asset with a real EUR or USD pair — i.e. actually tradeable, not just listed
 * (crypto and xStocks alike). Powers the rebalancing-target picker with Kraken's own ground
 * truth instead of a manually maintained registry, so a target added here resolves to the exact
 * `assets.symbol` value the next real Kraken sync writes for it. Unlike the sync fetchers above
 * (deliberately `no-store` — a sync must see this instant's balances), this list barely
 * changes, so it's revalidated every 6h instead of hitting Kraken on every combobox open.
 */
export async function fetchKrakenTradeableAssets(): Promise<KrakenTradeableAsset[]> {
  const cacheInit: RequestInit = { next: { revalidate: 21600 } }
  const [assetInfo, pairs] = await Promise.all([
    fetchKrakenAssetInfoRaw(cacheInit),
    fetchKrakenAssetPairsRaw(cacheInit),
  ])

  const tradeableCodes = new Set<string>()
  for (const pair of Object.values(pairs)) {
    if (pair.quote === 'ZEUR' || pair.quote === 'ZUSD') tradeableCodes.add(pair.base)
  }

  const seen = new Set<string>()
  const out: KrakenTradeableAsset[] = []
  for (const code of tradeableCodes) {
    const resolved = resolveKrakenAsset(code, assetInfo[code]?.altname)
    if (resolved.type === 'fiat') continue          // cash, not something to hold a rebalancing target for
    if (seen.has(resolved.dbSymbol)) continue        // two Kraken codes resolving to the same registry coin
    seen.add(resolved.dbSymbol)
    out.push({ code, symbol: resolved.symbol, dbSymbol: resolved.dbSymbol, name: resolved.name, type: resolved.type })
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

// ─── Ticker (public) ───────────────────────────────────────────────────────────
async function fetchTickerBatch(pairs: string[], assetClass?: 'tokenized_asset'): Promise<Record<string, number>> {
  if (pairs.length === 0) return {}
  const qs = new URLSearchParams({ pair: pairs.join(',') })
  if (assetClass) qs.set('asset_class', assetClass)
  const res  = await fetch(`${KRAKEN_API}/0/public/Ticker?${qs}`, { cache: 'no-store' })
  const json = await res.json() as { error: string[]; result?: Record<string, { c: [string, string] }> }
  if (json.error?.length) throw new Error(json.error.join(', '))

  const out: Record<string, number> = {}
  for (const [pair, data] of Object.entries(json.result ?? {})) {
    const price = parseFloat(data.c?.[0])
    if (!isNaN(price)) out[pair] = price
  }
  return out
}

/**
 * Kraken accepts eine kommagetrennte Pair-Liste pro Anfrage — aber xStocks (tokenized_asset)
 * brauchen zusätzlich `asset_class=tokenized_asset`, sonst kennt Kraken den Pair-Namen gar
 * nicht ("Unknown asset pair"). Wird ein normaler Krypto-Pair und ein xStock in DERSELBEN
 * Anfrage gemischt, liefert Kraken den Fehler trotzdem für die ganze Anfrage zurück, auch wenn
 * `result` die gültigen Daten enthält — das hätte hier (vor dem Aufteilen) den Preis für JEDEN
 * mitgefragten Coin unbrauchbar gemacht, sobald auch nur ein xStock dabei war. Deshalb zwei
 * getrennte Batches nach `aclass_base`, jeder für sich fehlertolerant.
 */
export async function fetchKrakenTickers(
  pairs: string[],
  assetPairs: Record<string, KrakenAssetPair> = {},
): Promise<Record<string, number>> {
  if (pairs.length === 0) return {}
  const tokenized = pairs.filter(p => assetPairs[p]?.aclass_base === 'tokenized_asset')
  const standard  = pairs.filter(p => assetPairs[p]?.aclass_base !== 'tokenized_asset')

  const [standardResult, tokenizedResult] = await Promise.all([
    fetchTickerBatch(standard).catch(() => ({} as Record<string, number>)),
    fetchTickerBatch(tokenized, 'tokenized_asset').catch(() => ({} as Record<string, number>)),
  ])
  return { ...standardResult, ...tokenizedResult }
}

// ─── Trades History (private, paginated) ───────────────────────────────────────
// Used to reconstruct an average cost basis per asset — Kraken's Balance endpoint only ever
// returns quantities, never what was paid for them.
export interface KrakenTrade {
  pair: string
  type: 'buy' | 'sell'
  price: string
  cost: string
  fee: string
  vol: string
  time: number
}

const TRADES_PAGE_SIZE  = 50
const TRADES_MAX_PAGES  = 10   // safety cap (500 trades) — TradesHistory/Ledgers cost more
                                // against Kraken's private-API rate limit than most endpoints,
                                // so pulling the full 20-page range risked "Rate limit exceeded"
                                // outright rather than just being slow.
const TRADES_PAGE_DELAY_MS = 1500 // paced pagination — gives Kraken's per-key counter time to
                                   // decay between calls instead of firing all pages back to back.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchKrakenTradesHistory(apiKey: string, apiSecret: string): Promise<KrakenTrade[]> {
  const path = '/0/private/TradesHistory'
  const trades: KrakenTrade[] = []

  for (let page = 0; page < TRADES_MAX_PAGES; page++) {
    if (page > 0) await sleep(TRADES_PAGE_DELAY_MS)

    const ofs = page * TRADES_PAGE_SIZE
    const nonce    = nextNonce()
    const postData = `nonce=${nonce}&ofs=${ofs}`

    const res = await fetch(`${KRAKEN_API}${path}`, {
      method:  'POST',
      headers: {
        'API-Key':      apiKey,
        'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    })

    const json = await res.json() as { error: string[]; result?: { trades: Record<string, KrakenTrade>; count: number } }
    if (json.error?.length) {
      // Rate-limited partway through: keep whatever pages we already have instead of
      // discarding them — a cost basis from the trades we did get is more useful than none,
      // and the caller (syncFromKraken) already surfaces a warning when trades come back empty.
      if (page > 0 && json.error.some(e => e.includes('Rate limit'))) break
      throw new Error(json.error.join(', '))
    }

    const pageTrades = Object.values(json.result?.trades ?? {})
    trades.push(...pageTrades)

    const total = json.result?.count ?? trades.length
    if (pageTrades.length === 0 || trades.length >= total) break
  }

  return trades
}

// ─── Open Positions (private, margin/leveraged trades) ─────────────────────────
// Kraken keeps leveraged/margin positions completely separate from spot holdings — Balance
// never includes them, so without this call they're simply invisible to the app.
export interface KrakenOpenPosition {
  pair:  string
  type:  'buy' | 'sell'   // 'buy' = long, 'sell' = short
  cost:  string           // opening cost basis (in the pair's quote currency)
  margin: string          // davon eigenes Kapital — Hebel = cost / margin
  fee:   string           // bisher angefallene Order- und Rollover-Gebuehren
  vol:   string
  vol_closed: string
  value?: string          // current value — only present with docalcs=true
  net?:   string          // unrealized P&L — only present with docalcs=true
  time:  number
}

export async function fetchKrakenOpenPositions(apiKey: string, apiSecret: string): Promise<KrakenOpenPosition[]> {
  const path     = '/0/private/OpenPositions'
  const nonce    = nextNonce()
  const postData = `nonce=${nonce}&docalcs=true` // docalcs → Kraken computes value/net for us

  const res = await fetch(`${KRAKEN_API}${path}`, {
    method:  'POST',
    headers: {
      'API-Key':      apiKey,
      'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  const json = await res.json() as { error: string[]; result?: Record<string, KrakenOpenPosition> }
  if (json.error?.length) throw new Error(json.error.join(', '))
  return Object.values(json.result ?? {})
}

// ─── EUR pricing (Kraken-first, no CoinGecko needed for anything Kraken itself trades) ────────
export interface KrakenPriceResult {
  /** EUR price per Kraken asset code, for everything Kraken could price directly. */
  pricesEur:  Record<string, number>
  /** Codes with no EUR or USD trading pair on Kraken at all — caller falls back to CoinGecko. */
  unresolved: string[]
  /** USD-per-EUR rate used for USD-quoted pairs — from Kraken's own fiat pair when listed,
   *  else `getEurUsdRate()` (CoinGecko-derived, never throws). Also useful for pricing a
   *  Kraken USD cash balance itself. */
  usdPerEur: number
}

export async function buildKrakenPriceMap(
  codes: string[],
  assetPairs: Record<string, KrakenAssetPair>,
): Promise<KrakenPriceResult> {
  const eurPairByCode = new Map<string, string>()
  const usdPairByCode = new Map<string, string>()
  let fxPairName: string | null = null
  let fxIsUsdBase = false // true if base=ZUSD/quote=ZEUR (ticker price is already EUR-per-USD)

  for (const [pairName, info] of Object.entries(assetPairs)) {
    if (info.quote === 'ZEUR' && !eurPairByCode.has(info.base)) eurPairByCode.set(info.base, pairName)
    if (info.quote === 'ZUSD' && !usdPairByCode.has(info.base)) usdPairByCode.set(info.base, pairName)
    if (fxPairName == null) {
      if (info.base === 'ZUSD' && info.quote === 'ZEUR') { fxPairName = pairName; fxIsUsdBase = true }
      else if (info.base === 'ZEUR' && info.quote === 'ZUSD') { fxPairName = pairName; fxIsUsdBase = false }
    }
  }

  const pairsToFetch = new Set<string>()
  for (const code of codes) {
    const pair = eurPairByCode.get(code) ?? usdPairByCode.get(code)
    if (pair) pairsToFetch.add(pair)
  }
  if (fxPairName) pairsToFetch.add(fxPairName)

  const tickers = pairsToFetch.size > 0 ? await fetchKrakenTickers([...pairsToFetch], assetPairs) : {}

  let usdPerEur: number | null = null
  if (fxPairName && tickers[fxPairName] != null) {
    usdPerEur = fxIsUsdBase ? 1 / tickers[fxPairName] : tickers[fxPairName]
  }
  if (usdPerEur == null) usdPerEur = await getEurUsdRate() // CoinGecko-derived fallback, never throws

  const pricesEur: Record<string, number> = {}
  const unresolved: string[] = []

  for (const code of codes) {
    const eurPair = eurPairByCode.get(code)
    if (eurPair && tickers[eurPair] != null) {
      pricesEur[code] = tickers[eurPair]
      continue
    }
    const usdPair = usdPairByCode.get(code)
    if (usdPair && tickers[usdPair] != null) {
      pricesEur[code] = tickers[usdPair] / usdPerEur
      continue
    }
    unresolved.push(code)
  }

  return { pricesEur, unresolved, usdPerEur }
}
