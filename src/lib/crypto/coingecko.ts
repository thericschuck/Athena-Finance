import { FIAT_EUR_PRICES } from '@/lib/crypto/coin-registry'

/** @deprecated Use COIN_REGISTRY from coin-registry.ts instead */
export const COINGECKO_IDS: Record<string, string> = {
  BTC:   'bitcoin',
  ETH:   'ethereum',
  SOL:   'solana',
  BNB:   'binancecoin',
  CVX:   'convex-finance',
  SUI:   'sui',
  AVAX:  'avalanche-2',
  LINK:  'chainlink',
  XRP:   'ripple',
  DOGE:  'dogecoin',
  ADA:   'cardano',
  DOT:   'polkadot',
  MATIC: 'matic-network',
  UNI:   'uniswap',
  AAVE:  'aave',
}

const BASE = 'https://api.coingecko.com/api/v3'
const BATCH_SIZE = 25

/**
 * Fetch EUR prices for a list of CoinGecko IDs.
 * Fiat symbols (eur, usd, chf, gbp) are resolved locally without an API call.
 * Requests are split into batches of 25 to avoid silent truncation by CoinGecko's free API.
 */
export async function getPrices(
  coingeckoIds: string[]
): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) return {}

  const result: Record<string, number> = {}

  // Resolve fiat IDs immediately (no network needed)
  const cryptoIds: string[] = []
  for (const id of coingeckoIds) {
    const lower = id.toLowerCase()
    if (lower in FIAT_EUR_PRICES) {
      result[id] = FIAT_EUR_PRICES[lower]
    } else {
      cryptoIds.push(id)
    }
  }

  if (cryptoIds.length === 0) return result

  // Split into chunks to avoid silent truncation on CoinGecko free tier
  const chunks: string[][] = []
  for (let i = 0; i < cryptoIds.length; i += BATCH_SIZE) {
    chunks.push(cryptoIds.slice(i, i + BATCH_SIZE))
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 600)) // respect rate limit between batches
    const res = await fetch(
      `${BASE}/simple/price?ids=${chunks[i].join(',')}&vs_currencies=eur`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status} ${res.statusText}`)
    const data: Record<string, { eur: number }> = await res.json()
    for (const [id, v] of Object.entries(data)) {
      if (v.eur != null) result[id] = v.eur
    }
  }

  return result
}

/** Returns the current EUR→USD exchange rate (e.g. 1.08). Falls back to 1.08 on error. */
export async function getEurUsdRate(): Promise<number> {
  try {
    const res = await fetch(
      `${BASE}/simple/price?ids=bitcoin&vs_currencies=eur,usd`,
      { cache: 'no-store' }
    )
    if (!res.ok) return 1.08
    const data: Record<string, { eur?: number; usd?: number }> = await res.json()
    const eur = data?.bitcoin?.eur
    const usd = data?.bitcoin?.usd
    if (eur && usd && eur > 0) return usd / eur
    return 1.08
  } catch {
    return 1.08
  }
}

export type CoinInfoResult =
  | { symbol: string; name: string }
  | { error: string }

export async function getCoinInfo(
  coingeckoId: string
): Promise<CoinInfoResult | null> {
  try {
    const res = await fetch(
      `${BASE}/coins/${coingeckoId}?localization=false&tickers=false&market_data=false`,
      { cache: 'no-store' }
    )
    if (res.status === 404) return null
    if (res.status === 429) return { error: 'Rate-Limit erreicht – kurz warten und erneut versuchen' }
    if (!res.ok)            return { error: `CoinGecko-Fehler (${res.status})` }

    const data = await res.json()
    if (!data?.symbol || !data?.name) return null

    return { symbol: (data.symbol as string).toUpperCase(), name: data.name as string }
  } catch {
    return { error: 'Keine Verbindung zu CoinGecko' }
  }
}
