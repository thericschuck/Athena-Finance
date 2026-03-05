// ─── Types ────────────────────────────────────────────────────────────────────
export type CoinType = 'crypto' | 'stable' | 'fiat'

export interface CoinEntry {
  symbol:       string           // Display ticker: 'BTC', 'USDT', 'EUR'
  name:         string           // Full name: 'Bitcoin', 'Tether USD', 'Euro'
  coingecko_id: string | null    // null for native fiat currencies
  type:         CoinType
}

// ─── Registry ─────────────────────────────────────────────────────────────────
export const COIN_REGISTRY: CoinEntry[] = [
  // ── Major Crypto ──────────────────────────────────────────────────────────
  { symbol: 'BTC',   name: 'Bitcoin',           coingecko_id: 'bitcoin',            type: 'crypto' },
  { symbol: 'ETH',   name: 'Ethereum',           coingecko_id: 'ethereum',           type: 'crypto' },
  { symbol: 'BNB',   name: 'BNB',                coingecko_id: 'binancecoin',        type: 'crypto' },
  { symbol: 'SOL',   name: 'Solana',             coingecko_id: 'solana',             type: 'crypto' },
  { symbol: 'XRP',   name: 'XRP',                coingecko_id: 'ripple',             type: 'crypto' },
  { symbol: 'ADA',   name: 'Cardano',            coingecko_id: 'cardano',            type: 'crypto' },
  { symbol: 'AVAX',  name: 'Avalanche',          coingecko_id: 'avalanche-2',        type: 'crypto' },
  { symbol: 'DOT',   name: 'Polkadot',           coingecko_id: 'polkadot',           type: 'crypto' },
  { symbol: 'LINK',  name: 'Chainlink',          coingecko_id: 'chainlink',          type: 'crypto' },
  { symbol: 'MATIC', name: 'Polygon',            coingecko_id: 'matic-network',      type: 'crypto' },
  { symbol: 'POL',   name: 'Polygon (POL)',       coingecko_id: 'polygon-ecosystem-token', type: 'crypto' },
  { symbol: 'UNI',   name: 'Uniswap',            coingecko_id: 'uniswap',            type: 'crypto' },
  { symbol: 'AAVE',  name: 'Aave',               coingecko_id: 'aave',               type: 'crypto' },
  { symbol: 'DOGE',  name: 'Dogecoin',           coingecko_id: 'dogecoin',           type: 'crypto' },
  { symbol: 'SUI',   name: 'Sui',                coingecko_id: 'sui',                type: 'crypto' },
  { symbol: 'CVX',   name: 'Convex Finance',     coingecko_id: 'convex-finance',     type: 'crypto' },
  { symbol: 'LTC',   name: 'Litecoin',           coingecko_id: 'litecoin',           type: 'crypto' },
  { symbol: 'ATOM',  name: 'Cosmos',             coingecko_id: 'cosmos',             type: 'crypto' },
  { symbol: 'OP',    name: 'Optimism',           coingecko_id: 'optimism',           type: 'crypto' },
  { symbol: 'ARB',   name: 'Arbitrum',           coingecko_id: 'arbitrum',           type: 'crypto' },
  { symbol: 'INJ',   name: 'Injective',          coingecko_id: 'injective-protocol', type: 'crypto' },
  { symbol: 'TIA',   name: 'Celestia',           coingecko_id: 'celestia',           type: 'crypto' },
  { symbol: 'TON',   name: 'Toncoin',            coingecko_id: 'the-open-network',   type: 'crypto' },
  { symbol: 'NEAR',  name: 'NEAR Protocol',      coingecko_id: 'near',               type: 'crypto' },

  // ── Stablecoins ───────────────────────────────────────────────────────────
  { symbol: 'USDT',  name: 'Tether USD',         coingecko_id: 'tether',             type: 'stable' },
  { symbol: 'USDC',  name: 'USD Coin',           coingecko_id: 'usd-coin',           type: 'stable' },
  { symbol: 'FDUSD', name: 'First Digital USD',  coingecko_id: 'first-digital-usd',  type: 'stable' },
  { symbol: 'DAI',   name: 'Dai',                coingecko_id: 'dai',                type: 'stable' },
  { symbol: 'PYUSD', name: 'PayPal USD',         coingecko_id: 'paypal-usd',         type: 'stable' },

  // ── Fiat (held on exchanges / wallets) ────────────────────────────────────
  { symbol: 'EUR',   name: 'Euro',               coingecko_id: null,                 type: 'fiat'   },
  { symbol: 'USD',   name: 'US Dollar',          coingecko_id: null,                 type: 'fiat'   },
  { symbol: 'CHF',   name: 'Schweizer Franken',  coingecko_id: null,                 type: 'fiat'   },
  { symbol: 'GBP',   name: 'Britisches Pfund',   coingecko_id: null,                 type: 'fiat'   },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find a registry entry by coingecko_id. */
export function findByCoinId(coingeckoId: string): CoinEntry | undefined {
  return COIN_REGISTRY.find(c => c.coingecko_id === coingeckoId)
}

/** Find a registry entry by symbol (case-insensitive). */
export function findBySymbol(symbol: string): CoinEntry | undefined {
  return COIN_REGISTRY.find(c => c.symbol.toLowerCase() === symbol.toLowerCase())
}

/**
 * Approximate EUR prices for fiat currencies.
 * EUR is always 1. Others are rough defaults — not used for financial precision.
 */
export const FIAT_EUR_PRICES: Record<string, number> = {
  eur: 1,
  usd: 0.92,
  chf: 1.05,
  gbp: 1.18,
}
