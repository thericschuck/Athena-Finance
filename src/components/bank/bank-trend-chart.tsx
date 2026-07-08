'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { BankTransaction } from '@/types/bank'

// Income/expense pair validated with scripts/validate_palette.js against this app's card
// surfaces. Light mode reuses the app's own tokens (--chart-2, --destructive), which pass
// as-is. The app's dark-mode tokens for those same slots fail the OKLCH lightness band
// (both land at L≈0.70, just outside the 0.48–0.67 dark band), so dark mode uses the
// dataviz skill's reference green/red slots instead, which pass cleanly.
const INCOME_LIGHT  = '#009689'
const EXPENSE_LIGHT = '#e7000b'
const INCOME_DARK  = '#008300'
const EXPENSE_DARK = '#e66767'

interface MonthDatum { month: string; income: number; expense: number }

function buildData(transactions: BankTransaction[]): MonthDatum[] {
  const byMonth = new Map<string, { income: number; expense: number }>()
  for (const tx of transactions) {
    const key = tx.value_date.slice(0, 7) // YYYY-MM
    const entry = byMonth.get(key) ?? { income: 0, expense: 0 }
    if (tx.amount >= 0) entry.income += tx.amount
    else entry.expense += tx.amount // stays negative — plotted below the baseline
    byMonth.set(key, entry)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))
}

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

export function BankTrendChart({ transactions }: { transactions: BankTransaction[] }) {
  const { locale } = useSettings()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const income  = isDark ? INCOME_DARK  : INCOME_LIGHT
  const expense = isDark ? EXPENSE_DARK : EXPENSE_LIGHT

  const data = useMemo(() => buildData(transactions), [transactions])

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Einnahmen &amp; Ausgaben pro Monat
        </p>
        <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten im aktuellen Filter.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Einnahmen &amp; Ausgaben pro Monat
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: income }} />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: expense }} />
            Ausgaben
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={v => monthLabel(v as string, locale)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={v => fmtCurrency(Math.abs(v as number), 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} width={56}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as MonthDatum
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs min-w-[140px]">
                  <p className="text-foreground font-medium mb-1">{monthLabel(label as string, locale)}</p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Einnahmen</span>
                    <span className="font-semibold tabular-nums" style={{ color: income }}>
                      +{fmtCurrency(d.income, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Ausgaben</span>
                    <span className="font-semibold tabular-nums" style={{ color: expense }}>
                      {fmtCurrency(d.expense, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="income" fill={income} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" fill={expense} radius={[0, 0, 4, 4]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
