import {
  type StrategySignals,
  type PortfolioAllocations,
  type SubPortfolioAsset,
} from '@/lib/crypto/rebalancing-defaults'

// ─── Minimal asset interface (no UI dependencies) ─────────────────────────────
export interface AssetInput {
  symbol:        string | null   // CoinGecko ID stored in assets.symbol (e.g. "bitcoin")
  portfolio_name: string | null
  current_price: number | null
  current_value: number | null
  quantity:      number | null
}

// ─── Output types ─────────────────────────────────────────────────────────────
export type RebalancingRow = {
  symbol:              string
  coingecko_id:        string
  sub_portfolio:       'core' | 'adam' | 'high_beta'
  sub_portfolio_label: string

  portfolio_weight: number
  asset_weight:     number
  target_pct:       number
  target_eur:       number

  current_eur:   number
  current_qty:   number
  current_price: number

  diff_eur:  number
  diff_qty:  number
  diff_pct:  number

  status: 'overweight' | 'underweight' | 'balanced'
  action: 'buy' | 'sell' | 'hold'
}

export type RebalancingResult = {
  rows:               RebalancingRow[]
  total_target:       number
  total_current:      number
  total_buy_eur:      number
  total_sell_eur:     number
  rebalancing_volume: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SUB_LABELS: Record<string, string> = {
  core:      'Core',
  adam:      'Adams Portfolio',
  high_beta: 'High Beta',
}

// Sub-portfolio → expected portfolio_name values (lowercase match)
const PORTFOLIO_NAME_MAP: Record<string, string[]> = {
  core:      ['main', 'core'],
  adam:      ['eltern', 'adam'],
  high_beta: ['high beta', 'high_beta', 'highbeta'],
}

function matchesPortfolio(portfolioName: string | null, subKey: string): boolean {
  if (!portfolioName) return false
  const lower = portfolioName.toLowerCase()
  return (PORTFOLIO_NAME_MAP[subKey] ?? []).some(p => lower.includes(p))
}

// ─── Main calculation ─────────────────────────────────────────────────────────
export function calculateRebalancing(
  signals:     StrategySignals,
  allocations: PortfolioAllocations,
  assets:      AssetInput[],
  totalValue:  number,
  threshold    = 5,           // % deviation below which = balanced
): RebalancingResult {
  // Step 1: Sub-portfolio weights
  const highBetaWeight = signals.high_beta.signal === 'long' ? signals.high_beta.weight : 0
  const coreWeight     = signals.core.signal !== 'cash'      ? signals.core.weight      : 0
  const adamWeight     = Math.max(0, 1 - coreWeight - highBetaWeight)

  // Step 2: Core assets (determined by signal)
  let coreAssets: SubPortfolioAsset[] = []
  if      (signals.core.signal === 'long_btc') coreAssets = [{ symbol: 'BTC', coingecko_id: 'bitcoin',  weight: 1.0 }]
  else if (signals.core.signal === 'long_eth') coreAssets = [{ symbol: 'ETH', coingecko_id: 'ethereum', weight: 1.0 }]

  // Build a global price lookup (any portfolio) as fallback
  const priceByCoingeckoId = new Map<string, number>()
  for (const a of assets) {
    if (a.symbol && (a.current_price ?? 0) > 0) {
      priceByCoingeckoId.set(a.symbol.toLowerCase(), a.current_price!)
    }
  }

  const subPortfolios: Array<{
    key:    'core' | 'adam' | 'high_beta'
    weight: number
    assets: SubPortfolioAsset[]
  }> = [
    { key: 'core',      weight: coreWeight,      assets: coreAssets },
    { key: 'adam',      weight: adamWeight,       assets: allocations.adam.assets },
    { key: 'high_beta', weight: highBetaWeight,   assets: allocations.high_beta.assets },
  ]

  // Step 3a: Pre-compute which coingecko_ids appear in more than one sub-portfolio
  //          (to avoid double-counting when falling back to global assets)
  const coinSubPortfolioCount = new Map<string, number>()
  for (const sp of subPortfolios) {
    if (sp.weight <= 0) continue
    for (const alloc of sp.assets) {
      const id = alloc.coingecko_id.toLowerCase()
      coinSubPortfolioCount.set(id, (coinSubPortfolioCount.get(id) ?? 0) + 1)
    }
  }

  // Step 3b: Global asset value map (sum across all portfolio_names)
  const globalValueMap = new Map<string, number>()
  const globalQtyMap   = new Map<string, number>()
  const globalPriceMap = new Map<string, number>()
  for (const a of assets) {
    const id = a.symbol?.toLowerCase()
    if (!id) continue
    if (a.current_value) globalValueMap.set(id, (globalValueMap.get(id) ?? 0) + a.current_value)
    if (a.quantity)      globalQtyMap.set(id,   (globalQtyMap.get(id)   ?? 0) + a.quantity)
    if ((a.current_price ?? 0) > 0 && !globalPriceMap.has(id)) globalPriceMap.set(id, a.current_price!)
  }

  // Step 3c: Build rows
  const rows: RebalancingRow[] = []

  for (const sp of subPortfolios) {
    if (sp.weight <= 0 || sp.assets.length === 0) continue

    for (const alloc of sp.assets) {
      const target_pct = sp.weight * alloc.weight * 100
      const target_eur = totalValue * sp.weight * alloc.weight
      const cgId       = alloc.coingecko_id.toLowerCase()

      // Primary match: same CoinGecko ID + matching portfolio_name
      const matched = assets.filter(a =>
        a.symbol?.toLowerCase() === cgId &&
        matchesPortfolio(a.portfolio_name, sp.key)
      )

      // Fallback: if no portfolio-specific match AND coin is unambiguous (only in 1 sub-portfolio),
      // use total global value to avoid showing 0 € for misnamed portfolio entries
      const useGlobalFallback = matched.length === 0 && (coinSubPortfolioCount.get(cgId) ?? 0) <= 1

      const current_eur = useGlobalFallback
        ? (globalValueMap.get(cgId) ?? 0)
        : matched.reduce((s, a) => s + (a.current_value ?? 0), 0)
      const current_qty   = useGlobalFallback
        ? (globalQtyMap.get(cgId) ?? 0)
        : matched.reduce((s, a) => s + (a.quantity ?? 0), 0)
      const current_price =
        matched.find(a => (a.current_price ?? 0) > 0)?.current_price
        ?? globalPriceMap.get(cgId)
        ?? priceByCoingeckoId.get(cgId)
        ?? 0

      const diff_eur = target_eur - current_eur
      const diff_qty = current_price > 0 ? diff_eur / current_price : 0
      const diff_pct = target_eur   > 0 ? (diff_eur / target_eur) * 100 : 0

      const absDiff = Math.abs(diff_pct)
      let status: RebalancingRow['status']
      let action: RebalancingRow['action']

      if (absDiff <= threshold) {
        status = 'balanced';    action = 'hold'
      } else if (diff_eur > 0) {
        status = 'underweight'; action = 'buy'
      } else {
        status = 'overweight';  action = 'sell'
      }

      rows.push({
        symbol:              alloc.symbol,
        coingecko_id:        alloc.coingecko_id,
        sub_portfolio:       sp.key,
        sub_portfolio_label: SUB_LABELS[sp.key],
        portfolio_weight:    sp.weight,
        asset_weight:        alloc.weight,
        target_pct,
        target_eur,
        current_eur,
        current_qty,
        current_price,
        diff_eur,
        diff_qty,
        diff_pct,
        status,
        action,
      })
    }
  }

  // Step 4: Summary — only count rows that need action (outside threshold)
  const total_buy_eur  = rows.reduce((s, r) => r.action === 'buy'  ? s + r.diff_eur          : s, 0)
  const total_sell_eur = rows.reduce((s, r) => r.action === 'sell' ? s + Math.abs(r.diff_eur) : s, 0)

  return {
    rows,
    total_target:       rows.reduce((s, r) => s + r.target_eur,  0),
    total_current:      rows.reduce((s, r) => s + r.current_eur, 0),
    total_buy_eur,
    total_sell_eur,
    rebalancing_volume: total_buy_eur + total_sell_eur,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatDiffQty(qty: number, symbol: string, diffEur = 0): string {
  if (Math.abs(qty) < 0.000001) {
    // qty=0 but significant EUR difference → price missing
    if (Math.abs(diffEur) > 1) return '⚠ Kein Preis'
    return '✓ Balanced'
  }
  const absQty   = Math.abs(qty)
  const decimals = absQty < 0.01 ? 6 : 4
  const sign     = qty > 0 ? '+' : ''
  const action   = qty > 0 ? 'kaufen' : 'verkaufen'
  return `${sign}${absQty.toFixed(decimals).replace('.', ',')} ${symbol} ${action}`
}

export function getPortfolioWeight(
  signals: StrategySignals,
): { core: number; adam: number; high_beta: number } {
  const highBeta = signals.high_beta.signal === 'long' ? signals.high_beta.weight : 0
  const core     = signals.core.signal !== 'cash'      ? signals.core.weight      : 0
  const adam     = Math.max(0, 1 - core - highBeta)
  return { core, adam, high_beta: highBeta }
}

// Sort order helper for sub-portfolio groups
const SP_ORDER: Record<string, number> = { core: 0, adam: 1, high_beta: 2 }

export function sortRows(rows: RebalancingRow[]): RebalancingRow[] {
  return [...rows].sort((a, b) => {
    const order = SP_ORDER[a.sub_portfolio] - SP_ORDER[b.sub_portfolio]
    if (order !== 0) return order
    return b.diff_eur - a.diff_eur   // within group: most underweight first
  })
}
