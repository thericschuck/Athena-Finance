'use client'

import { useEffect, useState } from 'react'
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

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtPct = (n: number) =>
  `${n.toFixed(1).replace('.', ',')} %`

const fmtDiffEur = (n: number) => {
  const sign = n > 0 ? '+' : n < 0 ? '' : ''
  return `${sign}${fmtEur(n)}`
}

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
function StatusBadge({ status }: { status: RebalancingRow['status'] }) {
  const map = {
    underweight: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    overweight:  'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300',
    balanced:    'bg-muted text-muted-foreground',
  }
  const label = {
    underweight: 'UNTERGEWICHTET',
    overweight:  'ÜBERGEWICHTET',
    balanced:    'BALANCED',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {label[status]}
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
            valueClass={result.rebalancing_volume > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
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
        <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-5 py-4">
          <CheckCircle2 className="size-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
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
                  row.action === 'buy'  ? 'text-green-600 dark:text-green-400' :
                  row.action === 'sell' ? 'text-red-600 dark:text-red-400'     : 'text-muted-foreground'

                return (
                  <tr
                    key={`${row.sub_portfolio}-${row.symbol}`}
                    className={`hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.symbol}</p>
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
                    <td className={`px-4 py-3 text-sm ${diffClass}`}>
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
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-1">
            <p className="text-xs text-green-700 dark:text-green-400">Kaufen gesamt</p>
            <p className="text-lg font-semibold text-green-700 dark:text-green-300 tabular-nums">
              +{fmtEur(result.total_buy_eur)}
            </p>
          </div>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-1">
            <p className="text-xs text-red-700 dark:text-red-400">Verkaufen gesamt</p>
            <p className="text-lg font-semibold text-red-700 dark:text-red-300 tabular-nums">
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
