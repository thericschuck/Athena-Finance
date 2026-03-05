'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
export type NetWorthSnapshot = {
  snapshot_date: string
  net_worth:        number | null
  total_checking:   number | null
  total_savings:    number | null
  total_cash:       number | null
  total_depot:      number | null
  total_crypto:     number | null
  total_bausparer:  number | null
  total_business:   number | null
  total_debts:      number | null
  total_assets:     number | null
}

type FilterKey = '3M' | '6M' | '1J' | 'All'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
type TooltipEntry = { payload: NetWorthSnapshot; value: number }
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  const d = payload[0]?.payload
  if (!d) return null

  const rows: [string, number | null][] = [
    ['Girokonto',   d.total_checking],
    ['Sparkonto',   d.total_savings],
    ['Cash',        d.total_cash],
    ['Depot',       d.total_depot],
    ['Crypto',      d.total_crypto],
    ['Bausparer',   d.total_bausparer],
    ['Business',    d.total_business],
    ['Schulden',    d.total_debts],
  ]

  const date = new Date(label ?? '').toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{date}</p>
      <p className="text-sm font-bold tabular-nums text-foreground mb-2">
        {fmtCurrency(d.net_worth)}
      </p>
      <div className="space-y-1 border-t border-border pt-2">
        {rows
          .filter(([, v]) => v != null && v !== 0)
          .map(([label, val]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className={`tabular-nums font-medium ${(val ?? 0) < 0 ? 'text-red-500' : 'text-foreground'}`}>
                {fmtCurrency(val)}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
function cutoff(key: FilterKey): Date | null {
  const d = new Date()
  switch (key) {
    case '3M': d.setMonth(d.getMonth() - 3);     return d
    case '6M': d.setMonth(d.getMonth() - 6);     return d
    case '1J': d.setFullYear(d.getFullYear() - 1); return d
    default:   return null
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NetWorthChart({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  const [filter, setFilter] = useState<FilterKey>('1J')

  const data = useMemo(() => {
    const from = cutoff(filter)
    const filtered = from
      ? snapshots.filter(s => new Date(s.snapshot_date) >= from)
      : snapshots
    return filtered.map(s => ({ ...s, value: s.net_worth ?? 0 }))
  }, [snapshots, filter])

  if (snapshots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm text-muted-foreground">Keine Snapshots vorhanden</p>
      </div>
    )
  }

  const FILTERS: FilterKey[] = ['3M', '6M', '1J', 'All']

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Worth Verlauf</p>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-all duration-150 ${
                filter === f
                  ? 'bg-foreground text-background scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={v =>
              new Date(v).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })
            }
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={v => fmtShort(v as number)}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#netWorthGradient)"
            dot={false}
            activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
