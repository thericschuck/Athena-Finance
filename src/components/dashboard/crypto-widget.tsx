import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'

export interface CryptoWidgetTopAsset {
  symbol: string
  value:  number
  pct:    number
}

interface Props {
  totalValue:        number
  totalCost:         number | null
  rebalancingVolume: number
  lastRebalancing:   string | null
  topAssets:         CryptoWidgetTopAsset[]
  locale:            string
}

export function CryptoWidget({ totalValue, totalCost, rebalancingVolume, lastRebalancing, topAssets, locale }: Props) {
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale)
  const pnl       = totalCost != null && totalCost > 0 ? totalValue - totalCost : null
  const pnlPct    = pnl != null && totalCost && totalCost > 0 ? (pnl / totalCost) * 100 : null
  const isPositive = pnl != null && pnl >= 0

  return (
    <div className="rounded-lg border border-border bg-card card-hover p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Crypto Portfolio</p>
        <Link href="/crypto" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Alle →
        </Link>
      </div>

      {/* Total + P&L */}
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{fmtEur(totalValue)}</p>
        {pnl != null && (
          <div className="flex items-center gap-1.5 mt-1">
            {isPositive
              ? <TrendingUp   className="size-3.5 text-green-500" />
              : <TrendingDown className="size-3.5 text-red-500"   />
            }
            <p className={`text-sm font-medium tabular-nums ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {isPositive ? '+' : ''}{fmtEur(pnl)}
              {pnlPct != null && ` (${isPositive ? '+' : ''}${pnlPct.toFixed(1)}%)`}
            </p>
          </div>
        )}
      </div>

      {/* Top assets */}
      {topAssets.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          {topAssets.map(a => (
            <div key={a.symbol} className="flex items-center justify-between text-xs">
              <span className="font-medium uppercase">{a.symbol}</span>
              <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
                <span>{a.pct.toFixed(0)} %</span>
                <span>{fmtEur(a.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rebalancing hint */}
      {rebalancingVolume >= 1 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            Rebalancing: {fmtEur(rebalancingVolume)}
          </p>
          <Link href="/crypto/rebalancing" className="text-xs text-amber-700 dark:text-amber-400 hover:underline shrink-0">
            Details →
          </Link>
        </div>
      )}
    </div>
  )
}
