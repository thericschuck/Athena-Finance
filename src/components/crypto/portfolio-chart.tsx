'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────
export type SnapshotRow = {
  snapshot_date: string
  portfolio_name: string | null
  value_eur: number
}

const PERIODS = ['1W', '1M', '3M', '6M', '1J', 'All'] as const
type Period = typeof PERIODS[number]

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

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

function formatY(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}k`
  return `€${value}`
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}) {
  const { locale } = useSettings()
  if (!active || !payload?.length || !label) return null
  const [y, m, d] = label.split('-')
  const total = payload.reduce((s, e) => s + (e.value ?? 0), 0)

  return (
    <div className="rounded-lg border border-border bg-card shadow-md p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-medium text-muted-foreground pb-1 border-b border-border">
        {d}.{m}.{y}
      </p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.dataKey}</span>
          </div>
          <span className="font-medium tabular-nums">{fmtCurrency(entry.value, 'EUR', locale)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-border">
          <span className="text-muted-foreground">Gesamt</span>
          <span className="font-semibold tabular-nums">{fmtCurrency(total, 'EUR', locale)}</span>
        </div>
      )}
    </div>
  )
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
  const visiblePortfolios = activePortfolio === 'Alle' ? portfolioNames : [activePortfolio]

  // Build chart data
  const chartData = useMemo(() => {
    const cutoff = cutoffDate(period)

    // Group by date → per portfolio_name → sum value_eur
    const byDate = new Map<string, Record<string, number>>()

    for (const row of snapshots) {
      if (row.snapshot_date < cutoff) continue
      const pName = row.portfolio_name ?? 'Sonstige'
      if (!visiblePortfolios.includes(pName)) continue

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
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {visiblePortfolios.map((name, i) => (
                <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              strokeOpacity={0.1}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={xFormatter}
              interval={tickInterval}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatY}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            {visiblePortfolios.length > 1 && (
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px', opacity: 0.7 }}
              />
            )}

            {visiblePortfolios.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="stack"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                fill={`url(#grad-${i})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
