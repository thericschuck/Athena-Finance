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

/**
 * Fetch EUR prices for a list of CoinGecko IDs.
 * Fiat symbols (eur, usd, chf, gbp) are resolved locally without an API call.
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

  const res = await fetch(
    `${BASE}/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=eur`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    throw new Error(`CoinGecko error: ${res.status} ${res.statusText}`)
  }

  const data: Record<string, { eur: number }> = await res.json()

  for (const [id, v] of Object.entries(data)) {
    if (v.eur != null) result[id] = v.eur
  }

  return result
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
