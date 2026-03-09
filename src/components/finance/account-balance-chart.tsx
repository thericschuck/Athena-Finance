'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency as libFmtCurrency } from '@/lib/format'

export type AccountBalancePoint = {
  snapshot_date: string
  balance:       number
}

type FilterKey = '1W' | '1M' | '3M' | '6M' | '1J' | 'All'
const FILTERS: FilterKey[] = ['1W', '1M', '3M', '6M', '1J', 'All']

function cutoff(key: FilterKey): Date | null {
  const d = new Date()
  if (key === '1W') { d.setDate(d.getDate() - 7);        return d }
  if (key === '1M') { d.setMonth(d.getMonth() - 1);      return d }
  if (key === '3M') { d.setMonth(d.getMonth() - 3);      return d }
  if (key === '6M') { d.setMonth(d.getMonth() - 6);      return d }
  if (key === '1J') { d.setFullYear(d.getFullYear() - 1); return d }
  return null
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(Math.round(n))
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string
}) {
  const { locale } = useSettings()

  if (!active || !payload?.length) return null
  const date = new Date(label ?? '').toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs min-w-[140px]">
      <p className="text-muted-foreground mb-1">{date}</p>
      <p className="text-sm font-bold tabular-nums text-foreground">{libFmtCurrency(payload[0].value, 'EUR', locale, { fractionDigits: 0 })}</p>
    </div>
  )
}

export function AccountBalanceChart({
  points,
  currency = 'EUR',
}: {
  points:   AccountBalancePoint[]
  currency?: string
}) {
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
    return (from ? points.filter(p => new Date(p.snapshot_date) >= from) : points)
  }, [points, filter])

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Noch keine Verlaufsdaten — der tägliche Snapshot läuft um 23:59 Uhr.
        </p>
      </div>
    )
  }

  const isPositive = (data.at(-1)?.balance ?? 0) >= 0

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Kontostand Verlauf {currency !== 'EUR' ? `(${currency})` : ''}
        </p>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${
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

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isPositive ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} stopOpacity={0.15} />
              <stop offset="95%" stopColor={isPositive ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={v => xFormatter(v, filter)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} minTickGap={40}
          />
          <YAxis
            tickFormatter={v => fmtShort(v as number)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={isPositive ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
            strokeWidth={2}
            fill="url(#balGrad)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
