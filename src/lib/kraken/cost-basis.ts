/**
 * Volume-weighted average cost basis from Kraken trades, in EUR.
 * Pure function — Kraken-pair→asset-code resolution and USD→EUR conversion of each trade's
 * cost happen in the caller (see `syncFromKraken`); this only walks pre-normalized trades.
 *
 * Known limitation: only EUR-/USD-quoted trades carry a meaningful EUR cost, so crypto-to-
 * crypto trades (e.g. ETH/BTC) are excluded from the average entirely — the caller filters
 * those out before this function ever sees them.
 */

export interface NormalizedTrade {
  code:    string        // Kraken asset code the trade affects (the pair's base)
  type:    'buy' | 'sell'
  volume:  number        // quantity of `code` traded
  costEur: number        // trade cost in EUR
  time:    number        // unix seconds — trades are sorted by this before processing
}

/**
 * Average-cost-basis convention: a buy shifts the average toward its own price; a sell
 * reduces the held quantity but leaves the average cost of what remains unchanged.
 */
export function computeAverageCostBasis(trades: NormalizedTrade[]): Map<string, number | null> {
  const byCode = new Map<string, NormalizedTrade[]>()
  for (const t of trades) {
    const list = byCode.get(t.code) ?? []
    list.push(t)
    byCode.set(t.code, list)
  }

  const result = new Map<string, number | null>()
  for (const [code, list] of byCode) {
    const sorted = [...list].sort((a, b) => a.time - b.time)
    let qty = 0
    let avg = 0
    for (const t of sorted) {
      if (t.type === 'buy') {
        const newQty = qty + t.volume
        avg = newQty > 0 ? (avg * qty + t.costEur) / newQty : 0
        qty = newQty
      } else {
        qty = Math.max(0, qty - t.volume)
      }
    }
    result.set(code, qty > 0 ? avg : null)
  }
  return result
}
