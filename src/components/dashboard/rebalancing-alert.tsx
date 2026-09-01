import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'

interface Props {
  rebalancingVolume: number
  lastRebalancing:   string | null
  locale:            string
  dateFormat:        string
}

export function RebalancingAlert({ rebalancingVolume, lastRebalancing, locale, dateFormat }: Props) {
  if (rebalancingVolume < 1) return null

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-warning shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Rebalancing empfohlen — {fmtCurrency(rebalancingVolume, 'EUR', locale)} Handelsvolumen
          </p>
          {lastRebalancing && (
            <p className="text-xs text-warning">
              Letztes Rebalancing: {fmtDate(lastRebalancing, dateFormat)}
            </p>
          )}
        </div>
      </div>
      <Link
        href="/crypto/rebalancing"
        className="text-sm font-medium text-warning hover:underline shrink-0"
      >
        Zum Rechner →
      </Link>
    </div>
  )
}
