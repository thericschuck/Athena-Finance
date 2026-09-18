// ─── Ziel-Portfolio: flache Liste von Assets mit Ziel-% ───────────────────────
// Ersetzt das frühere Core/Adam/High-Beta-Signalsystem (Strategie-Signale). Kein
// Sub-Portfolio, keine Signale — nur "dieses Asset soll X % des Portfolios sein".
export interface RebalancingTarget {
  symbol:       string
  coingecko_id: string
  target_pct:   number   // 0–100
}

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
  symbol:        string
  coingecko_id:  string

  target_pct:    number
  target_eur:    number

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
  total_target_pct:   number
  total_target:       number
  total_current:      number
  total_buy_eur:      number
  total_sell_eur:     number
  rebalancing_volume: number
}

// ─── Main calculation ─────────────────────────────────────────────────────────
export function calculateRebalancing(
  targets:    RebalancingTarget[],
  assets:     AssetInput[],
  totalValue: number,
  threshold   = 5,           // % deviation below which = balanced
  // Live-Kraken-Preise (coingecko_id → EUR) fuer Ziel-Assets ohne eigenen Bestand — die haben
  // keine `assets`-Zeile und damit keinen Preis aus der letzten Sync-Valuation.
  livePrices: Record<string, number> = {},
): RebalancingResult {
  // Global value/qty/price per coingecko_id, summed across all portfolios/exchanges —
  // es gibt keine Sub-Portfolios mehr, ein Asset ist ein Asset.
  const valueByCgId = new Map<string, number>()
  const qtyByCgId   = new Map<string, number>()
  const priceByCgId = new Map<string, number>()
  for (const a of assets) {
    const id = a.symbol?.toLowerCase()
    if (!id) continue
    if (a.current_value) valueByCgId.set(id, (valueByCgId.get(id) ?? 0) + a.current_value)
    if (a.quantity)      qtyByCgId.set(id,   (qtyByCgId.get(id)   ?? 0) + a.quantity)
    if ((a.current_price ?? 0) > 0 && !priceByCgId.has(id)) priceByCgId.set(id, a.current_price!)
  }

  const rows: RebalancingRow[] = targets.map(t => {
    const id = t.coingecko_id.toLowerCase()

    const current_eur   = valueByCgId.get(id) ?? 0
    const current_qty   = qtyByCgId.get(id)   ?? 0
    const current_price = priceByCgId.get(id) ?? livePrices[id] ?? 0

    const target_eur = totalValue * (t.target_pct / 100)
    const diff_eur    = target_eur - current_eur
    const diff_qty    = current_price > 0 ? diff_eur / current_price : 0
    const diff_pct    = target_eur   > 0 ? (diff_eur / target_eur) * 100 : (current_eur > 0 ? -100 : 0)

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

    return {
      symbol:       t.symbol,
      coingecko_id: t.coingecko_id,
      target_pct:   t.target_pct,
      target_eur,
      current_eur,
      current_qty,
      current_price,
      diff_eur,
      diff_qty,
      diff_pct,
      status,
      action,
    }
  })

  const total_buy_eur  = rows.reduce((s, r) => r.action === 'buy'  ? s + r.diff_eur          : s, 0)
  const total_sell_eur = rows.reduce((s, r) => r.action === 'sell' ? s + Math.abs(r.diff_eur) : s, 0)

  return {
    rows,
    total_target_pct:   rows.reduce((s, r) => s + r.target_pct, 0),
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
