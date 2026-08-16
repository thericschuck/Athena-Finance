'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────
export type SnapshotRow = {
  snapshot_date: string
  portfolio_name: string | null
  value_eur: number
}

const PERIODS = ['1W', '1M', '3M', '6M', '1J', 'All'] as const
type Period = typeof PERIODS[number]

// recharts is a heavy dependency — load it on demand, client-only.
const PortfolioAreaChart = dynamic(
  () => import('@/components/crypto/portfolio-area-chart').then(m => m.PortfolioAreaChart),
  { ssr: false }
)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cutoffDate(period: Period): string {
  const d = new Date()
  if (period === '1W') d.setDate(d.getDate() - 7)
  else if (period === '1M') d.setMonth(d.getMonth() - 1)
  else if (period === '3M') d.setMonth(d.getMonth() - 3)
  else if (period === '6M') d.setMonth(d.getMonth() - 6)
  else if (period === '1J') d.setFullYear(d.getFullYear() - 1)
  else return '2000-01-01'
  return d.toISOString().split('T')[0]
}

function formatXTick(dateStr: string, period: Period): string {
  const [y, m, d] = dateStr.split('-')
  return period === '1W' || period === '1M' || period === '3M' ? `${d}.${m}.` : `${m}/${y.slice(2)}`
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PortfolioChart({ snapshots }: { snapshots: SnapshotRow[] }) {
  const [period, setPeriod] = useState<Period>('6M')
  const [activePortfolio, setActivePortfolio] = useState<string>('Alle')

  // Unique portfolio names from data
  const portfolioNames = useMemo(() => {
    const s = new Set<string>()
    for (const row of snapshots) s.add(row.portfolio_name ?? 'Sonstige')
    return Array.from(s).sort()
  }, [snapshots])

  // Which portfolios to show as Areas
  const visiblePortfolios = useMemo(
    () => activePortfolio === 'Alle' ? portfolioNames : [activePortfolio],
    [activePortfolio, portfolioNames]
  )

  // Build chart data
  const chartData = useMemo(() => {
    const cutoff = cutoffDate(period)
    const visibleSet = new Set(visiblePortfolios)

    // Group by date → per portfolio_name → sum value_eur
    const byDate = new Map<string, Record<string, number>>()

    for (const row of snapshots) {
      if (row.snapshot_date < cutoff) continue
      const pName = row.portfolio_name ?? 'Sonstige'
      if (!visibleSet.has(pName)) continue

      if (!byDate.has(row.snapshot_date)) byDate.set(row.snapshot_date, {})
      const entry = byDate.get(row.snapshot_date)!
      entry[pName] = (entry[pName] ?? 0) + row.value_eur
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }))
  }, [snapshots, period, visiblePortfolios])

  // X-axis tick formatter (needs period in closure)
  const xFormatter = (v: string) => formatXTick(v, period)

  // Reduce X ticks to avoid crowding (show ~6 ticks max)
  const tickInterval = Math.max(0, Math.floor(chartData.length / 6) - 1)

  const isEmpty = chartData.length === 0

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      {/* Header + controls */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold">Portfolio-Entwicklung</h2>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Portfolio pills */}
          {portfolioNames.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <Pill label="Alle" active={activePortfolio === 'Alle'} onClick={() => setActivePortfolio('Alle')} />
              {portfolioNames.map(name => (
                <Pill key={name} label={name} active={activePortfolio === name} onClick={() => setActivePortfolio(name)} />
              ))}
            </div>
          )}

          {/* Period pills */}
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <Pill key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {isEmpty ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Keine Snapshot-Daten für diesen Zeitraum
          </p>
        </div>
      ) : (
        <PortfolioAreaChart
          chartData={chartData}
          visiblePortfolios={visiblePortfolios}
          xFormatter={xFormatter}
          tickInterval={tickInterval}
        />
      )}
    </div>
  )
}
