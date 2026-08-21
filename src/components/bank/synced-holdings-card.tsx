'use client'

import { Landmark } from 'lucide-react'
import type { DepotHolding } from '@/types/bank'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useSettings } from '@/components/providers/settings-context'

interface Props {
  holdings: DepotHolding[]
}

/**
 * Read-only view of depot positions auto-synced via FinTS (HKWPD) — e.g. a Union
 * Investment "UnionDepot" reachable through the same login as the Girokonto.
 * Deliberately separate from the manually-entered Depot module (/depot): this is
 * a live snapshot from the bank, not something the user maintains by hand.
 */
export function SyncedHoldingsCard({ holdings }: Props) {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  if (holdings.length === 0) return null

  const byAccount = holdings.reduce<Record<string, DepotHolding[]>>((acc, h) => {
    const key = h.account_label || 'Depot'
    ;(acc[key] ??= []).push(h)
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Depot (automatisch synchronisiert)</h2>
      </div>

      {Object.entries(byAccount).map(([label, rows]) => {
        const total = rows.reduce((s, r) => s + (r.total_value ?? 0), 0)
        return (
          <div key={label} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {label}
                {rows[0]?.bank_label && rows[0].bank_label !== label && (
                  <span className="text-muted-foreground/70"> · {rows[0].bank_label}</span>
                )}
              </span>
              <span className="font-mono">{fmtEur(total)}</span>
            </div>
            <div className="space-y-1">
              {rows.map(h => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.name ?? h.isin}</p>
                    <p className="text-xs text-muted-foreground font-mono">{h.isin}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono">{h.total_value != null ? fmtEur(h.total_value) : '–'}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.pieces != null ? `${h.pieces} Stück` : ''}
                      {h.market_value != null ? ` · ${fmtEur(h.market_value)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {rows[0]?.valuation_date && (
              <p className="text-xs text-muted-foreground">
                Kurs vom {fmtDate(rows[0].valuation_date!, dateFormat)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
