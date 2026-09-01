/**
 * Shared Kraken API utilities.
 * Server-side only — never import in client components.
 */
import { createHash, createHmac } from 'crypto'
import { getEurUsdRate } from '@/lib/crypto/coingecko'

const KRAKEN_API = 'https://api.kraken.com'

// ─── Asset Code Mapping ───────────────────────────────────────────────────────
// Kraken uses internal codes that differ from standard trading symbols.
// X prefix = crypto, Z prefix = fiat. Some modern assets use plain symbols.
export const KRAKEN_TO_SYMBOL: Record<string, string> = {
  // X-prefixed legacy crypto codes
  XXBT:  'BTC',
  XETH:  'ETH',
  XXRP:  'XRP',
  XLTC:  'LTC',
  XXLM:  'XLM',
  XDOGE: 'DOGE',
  XXMR:  'XMR',
  XREP:  'REP',
  XZEC:  'ZEC',
  XMLN:  'MLN',
  XICN:  'ICN',
  // Z-prefixed fiat codes
  ZEUR:  'EUR',
  ZUSD:  'USD',
  ZGBP:  'GBP',
  ZCAD:  'CAD',
  ZJPY:  'JPY',
  ZCHF:  'CHF',
  ZAUD:  'AUD',
  // Modern assets already use standard symbols — pass through as-is
}

/**
 * Resolves a Kraken internal asset code to a standard trading symbol.
 * Falls back to stripping a leading X/Z if no explicit mapping exists.
 *
 * `KRAKEN_TO_SYMBOL` still wins over Kraken's own `/Assets` "altname" for the handful of
 * legacy-prefixed codes in it — Kraken's API calls Bitcoin "XBT" (an old ISO-4217-style
 * currency code), but nobody using Kraken's own web/app UI ever sees that name, so blindly
 * preferring the API's altname there would show "XBT" instead of "Bitcoin". For every other
 * (mostly modern, unprefixed) code, `/Assets`' altname is what actually gets used — see
 * `fetchKrakenAssetInfo()` below and its call site in `syncFromKraken()`.
 */
export function krakenCodeToSymbol(code: string): string {
  if (KRAKEN_TO_SYMBOL[code]) return KRAKEN_TO_SYMBOL[code]
  // Heuristic: single-letter X/Z prefix on 3-4 char codes
  if ((code.startsWith('X') || code.startsWith('Z')) && code.length <= 5) {
    return code.slice(1)
  }
  return code
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
function nextNonce(): string {
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

export async function fetchKrakenAssetInfo(): Promise<Record<string, KrakenAssetInfo>> {
  const res  = await fetch(`${KRAKEN_API}/0/public/Assets`, { cache: 'no-store' })
  const json = await res.json() as { error: string[]; result?: Record<string, KrakenAssetInfo> }
  if (json.error?.length) throw new Error(json.error.join(', '))
  return json.result ?? {}
}

// ─── Asset Pairs (public) ──────────────────────────────────────────────────────
// Which pairs actually exist for a code — needed before calling Ticker, since Kraken errors
// on a guessed pair name instead of returning "no data".
export interface KrakenAssetPair { altname: string; base: string; quote: string }

export async function fetchKrakenAssetPairs(): Promise<Record<string, KrakenAssetPair>> {
  const res  = await fetch(`${KRAKEN_API}/0/public/AssetPairs`, { cache: 'no-store' })
  const json = await res.json() as { error: string[]; result?: Record<string, KrakenAssetPair> }
  if (json.error?.length) throw new Error(json.error.join(', '))
  return json.result ?? {}
}

// ─── Ticker (public) ───────────────────────────────────────────────────────────
// Kraken accepts a comma-separated pair list, so every price we need comes back in one call.
export async function fetchKrakenTickers(pairs: string[]): Promise<Record<string, number>> {
  if (pairs.length === 0) return {}
  const res  = await fetch(`${KRAKEN_API}/0/public/Ticker?pair=${pairs.join(',')}`, { cache: 'no-store' })
  const json = await res.json() as { error: string[]; result?: Record<string, { c: [string, string] }> }
  if (json.error?.length) throw new Error(json.error.join(', '))

  const out: Record<string, number> = {}
  for (const [pair, data] of Object.entries(json.result ?? {})) {
    const price = parseFloat(data.c?.[0])
    if (!isNaN(price)) out[pair] = price
  }
  return out
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

  const tickers = pairsToFetch.size > 0 ? await fetchKrakenTickers([...pairsToFetch]) : {}

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
