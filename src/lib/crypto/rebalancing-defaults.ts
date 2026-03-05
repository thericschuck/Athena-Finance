export type StrategySignal = 'long_btc' | 'long_eth' | 'cash'
export type HighBetaSignal = 'long' | 'cash'

export interface StrategySignals {
  core: {
    signal: StrategySignal
    weight: number
  }
  high_beta: {
    signal: HighBetaSignal
    weight: number
  }
}

export interface SubPortfolioAsset {
  symbol: string
  coingecko_id: string
  weight: number
}

export interface PortfolioAllocations {
  core: { assets: SubPortfolioAsset[] }
  adam: { assets: SubPortfolioAsset[] }
  high_beta: { assets: SubPortfolioAsset[] }
}

export const DEFAULT_STRATEGY_SIGNALS: StrategySignals = {
  core: {
    signal: 'cash',
    weight: 0.50,
  },
  high_beta: {
    signal: 'long',
    weight: 0.10,
  },
}

export const DEFAULT_PORTFOLIO_ALLOCATIONS: PortfolioAllocations = {
  core: {
    assets: [
      { symbol: 'BTC', coingecko_id: 'bitcoin', weight: 1.0 },
    ],
  },
  adam: {
    assets: [
      { symbol: 'ETH', coingecko_id: 'ethereum',    weight: 0.714 },
      { symbol: 'BNB', coingecko_id: 'binancecoin', weight: 0.286 },
    ],
  },
  high_beta: {
    assets: [
      { symbol: 'ETH', coingecko_id: 'ethereum',       weight: 0.38 },
      { symbol: 'SOL', coingecko_id: 'solana',          weight: 0.38 },
      { symbol: 'CVX', coingecko_id: 'convex-finance',  weight: 0.24 },
    ],
  },
}
