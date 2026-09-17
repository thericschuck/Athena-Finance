'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { markRebalancingDone } from '@/app/(dashboard)/crypto/actions'
import {
  calculateRebalancing, sortRows, formatDiffQty,
  type RebalancingResult, type RebalancingRow,
} from '@/lib/crypto/rebalancing'
import { StrategySignals } from '@/components/crypto/strategy-signals'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'
import type {
  StrategySignals as StrategySignalsType,
  PortfolioAllocations,
} from '@/lib/crypto/rebalancing-defaults'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}.${m}.${y}`
}

// ─── Sub-portfolio badge ──────────────────────────────────────────────────────
const SP_BADGE: Record<string, string> = {
  core:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  adam:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  high_beta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

function SubBadge({ row }: { row: RebalancingRow }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SP_BADGE[row.sub_portfolio]}`}>
      {row.sub_portfolio_label}
    </span>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_BADGE_CLASS: Record<RebalancingRow['status'], string> = {
  underweight: 'bg-success/10 text-success',
  overweight:  'bg-danger/10 text-danger',
  balanced:    'bg-muted text-muted-foreground',
}
const STATUS_BADGE_LABEL: Record<RebalancingRow['status'], string> = {
  underweight: 'UNTERGEWICHTET',
  overweight:  'ÜBERGEWICHTET',
  balanced:    'BALANCED',
}

function StatusBadge({ status }: { status: RebalancingRow['status'] }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
      {STATUS_BADGE_LABEL[status]}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  assets:              AssetWithPrice[]
  initialSignals:      StrategySignalsType
  initialAllocations:  PortfolioAllocations
  totalValue:          number
  lastRebalancing:     string | null
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RebalancingCalculator({
  assets, initialSignals, initialAllocations, totalValue, lastRebalancing: initLast,
}: Props) {
  const { locale } = useSettings()
  const fmtEur     = (n: number) => fmtCurrency(n, 'EUR', locale)
  const decimalSeparator = useMemo(() => new Intl.NumberFormat(locale).format(1.1)[1], [locale])
  const fmtPct     = (n: number) => `${n.toFixed(1).replace('.', decimalSeparator)} %`
  const fmtDiffEur = (n: number) => `${n > 0 ? '+' : ''}${fmtEur(n)}`

  const [signals,     setSignals]     = useState<StrategySignalsType>(initialSignals)
  const [allocations, setAllocations] = useState<PortfolioAllocations>(initialAllocations)
  const [threshold,   setThreshold]   = useState(5)
  const [result,      setResult]      = useState<RebalancingResult>(() =>
    calculateRebalancing(initialSignals, initialAllocations, assets, totalValue, 5)
  )
  const [lastRebalancing, setLastRebalancing] = useState(initLast)
  const [isMarking,   setIsMarking]   = useState(false)
  const [markMsg,     setMarkMsg]     = useState<string | null>(null)

  // Recalculate whenever inputs change
  useEffect(() => {
    setResult(calculateRebalancing(signals, allocations, assets, totalValue, threshold))
  }, [signals, allocations, assets, totalValue, threshold])

  function handleSignalsChange(s: StrategySignalsType, a: PortfolioAllocations) {
    setSignals(s)
    setAllocations(a)
  }

  async function handleMarkDone() {
    setIsMarking(true)
    setMarkMsg(null)
    try {
      await markRebalancingDone()
      setLastRebalancing(new Date().toISOString())
      setMarkMsg('Als erledigt markiert')
    } catch (e) {
      setMarkMsg(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setIsMarking(false)
    }
  }

  const sortedRows = sortRows(result.rows)
  const isBalanced = result.rebalancing_volume < 1  // less than €1 → effectively balanced

  return (
    <div className="space-y-8">
      {/* ── Strategy signals ─────────────────────────────────────────────── */}
      <StrategySignals
        initialSignals={signals}
        initialAllocations={allocations}
        onChange={handleSignalsChange}
      />

      <hr className="border-border" />

      {/* ── Calculator header ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Rebalancing-Rechner</h2>

          {/* Threshold input */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Abweichung ignorieren unter:</span>
            <Input
              type="number" min="0" max="50" step="0.5"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value) || 0)}
              className="h-7 w-16 text-right"
            />
            <span className="text-muted-foreground">%</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Gesamtportfolio"     value={fmtEur(totalValue)} />
          <StatCard
            label="Letztes Rebalancing"
            value={lastRebalancing ? fmtDate(lastRebalancing) : 'Noch nie'}
          />
          <StatCard
            label="Rebalancing-Volumen"
            value={fmtEur(result.rebalancing_volume)}
            valueClass={result.rebalancing_volume > 0 ? 'text-warning' : ''}
          />
        </div>

        {/* Mark done button */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleMarkDone} disabled={isMarking}>
            {isMarking ? 'Wird gespeichert…' : 'Als erledigt markieren'}
          </Button>
          {markMsg && <span className="text-xs text-muted-foreground">{markMsg}</span>}
        </div>
      </div>

      {/* ── Balanced state ───────────────────────────────────────────────── */}
      {isBalanced && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-5 py-4">
          <CheckCircle2 className="size-5 text-success shrink-0" />
          <p className="text-sm font-medium text-success">
            Portfolio ist balanced — kein Rebalancing nötig
          </p>
        </div>
      )}

      {/* ── Rebalancing table ────────────────────────────────────────────── */}
      {sortedRows.length > 0 && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Coin</th>
                <th className="text-left px-4 py-2.5 font-medium">Sub-Portfolio</th>
                <th className="text-right px-4 py-2.5 font-medium">Ziel %</th>
                <th className="text-right px-4 py-2.5 font-medium">Ziel €</th>
                <th className="text-right px-4 py-2.5 font-medium">Aktuell €</th>
                <th className="text-right px-4 py-2.5 font-medium">Differenz €</th>
                <th className="text-left px-4 py-2.5 font-medium">Aktion</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const isLast    = i === sortedRows.length - 1
                const diffClass =
                  row.action === 'buy'  ? 'text-success' :
                  row.action === 'sell' ? 'text-danger'     : 'text-muted-foreground'

                return (
                  <tr
                    key={`${row.sub_portfolio}-${row.symbol}`}
                    className={`hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.symbol}</p>
                      <p className="text-xs text-muted-foreground/60">{row.coingecko_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <SubBadge row={row} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtPct(row.target_pct)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtEur(row.target_eur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {fmtEur(row.current_eur)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${diffClass}`}>
                      {fmtDiffEur(row.diff_eur)}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums ${diffClass}`}>
                      {formatDiffQty(row.diff_qty, row.symbol, row.diff_eur)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Summary footer ───────────────────────────────────────────────── */}
      {result.rebalancing_volume > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-1">
            <p className="text-xs text-success">Kaufen gesamt</p>
            <p className="text-lg font-semibold text-success tabular-nums">
              +{fmtEur(result.total_buy_eur)}
            </p>
          </div>
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 space-y-1">
            <p className="text-xs text-danger">Verkaufen gesamt</p>
            <p className="text-lg font-semibold text-danger tabular-nums">
              −{fmtEur(result.total_sell_eur)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Gesamt-Volumen</p>
            <p className="text-lg font-semibold tabular-nums">
              {fmtEur(result.rebalancing_volume)}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedRows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Keine Assets in der Berechnung — setze ein aktives Signal und füge Assets hinzu.
          </p>
        </div>
      )}
    </div>
  )
}
