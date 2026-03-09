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
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency as libFmtCurrency } from '@/lib/format'

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

type FilterKey = '1W' | '1M' | '3M' | '6M' | '1J' | 'All'
const FILTERS: FilterKey[] = ['1W', '1M', '3M', '6M', '1J', 'All']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function cutoff(key: FilterKey): Date | null {
  const d = new Date()
  if (key === '1W') { d.setDate(d.getDate() - 7);       return d }
  if (key === '1M') { d.setMonth(d.getMonth() - 1);     return d }
  if (key === '3M') { d.setMonth(d.getMonth() - 3);     return d }
  if (key === '6M') { d.setMonth(d.getMonth() - 6);     return d }
  if (key === '1J') { d.setFullYear(d.getFullYear() - 1); return d }
  return null
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
type TooltipEntry = { payload: NetWorthSnapshot; value: number }
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  const { locale } = useSettings()

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

  const date = new Date(label ?? '').toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{date}</p>
      <p className="text-sm font-bold tabular-nums text-foreground mb-2">
        {d.net_worth == null ? '—' : libFmtCurrency(d.net_worth, 'EUR', locale, { fractionDigits: 0 })}
      </p>
      <div className="space-y-1 border-t border-border pt-2">
        {rows
          .filter(([, v]) => v != null && v !== 0)
          .map(([label, val]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className={`tabular-nums font-medium ${(val ?? 0) < 0 ? 'text-red-500' : 'text-foreground'}`}>
                {val == null ? '—' : libFmtCurrency(val, 'EUR', locale, { fractionDigits: 0 })}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NetWorthChart({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  const { locale } = useSettings()
  const [filter, setFilter] = useState<FilterKey>('1J')

  const xFormatter = (v: string, key: FilterKey): string => {
    const d = new Date(v)
    if (key === '1W' || key === '1M') {
      return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
    }
    return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
  }

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

  return (
    <div className="rounded-lg border border-border bg-card p-5">
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

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={v => xFormatter(v, filter)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={v => fmtShort(v as number)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }} />
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
