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
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Rebalancing empfohlen — {fmtCurrency(rebalancingVolume, 'EUR', locale)} Handelsvolumen
          </p>
          {lastRebalancing && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Letztes Rebalancing: {fmtDate(lastRebalancing, dateFormat)}
            </p>
          )}
        </div>
      </div>
      <Link
        href="/crypto/rebalancing"
        className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0"
      >
        Zum Rechner →
      </Link>
    </div>
  )
}
