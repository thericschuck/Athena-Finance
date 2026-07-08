'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { CATEGORIES } from '@/lib/fints/categorize'
import type { BankTransaction } from '@/types/bank'

// Categorical palette validated against this app's card surfaces (#ffffff / #0f172b) with
// scripts/validate_palette.js from the dataviz skill: lightness band, chroma floor, CVD
// separation (ΔE 24.2 light / 10.3 dark — legal with the direct labels used here) and
// contrast all pass. The app's own --chart-1..5 tokens do NOT pass (fail lightness/chroma/CVD),
// so this chart intentionally uses its own validated set instead of the theme's default ramp.
const CATEGORICAL_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7']
const CATEGORICAL_DARK  = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9']
const OTHER_LIGHT = '#898781'
const OTHER_DARK  = '#6b7280'

const UNCATEGORIZED = 'Ohne Kategorie'
const OTHER = 'Andere'
const MAX_SLOTS = 5

// Color follows the entity: every category name maps to the same hue every time,
// regardless of which categories happen to be visible in the current filter.
const CATEGORY_COLOR_INDEX = new Map<string, number>(
  CATEGORIES.map((c, i) => [c, i % CATEGORICAL_LIGHT.length]),
)

interface Datum { name: string; value: number; colorIndex: number | null }

function buildData(transactions: BankTransaction[]): Datum[] {
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.amount >= 0) continue // expenses only
    const key = tx.category ?? UNCATEGORIZED
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(tx.amount))
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, MAX_SLOTS)
  const rest = sorted.slice(MAX_SLOTS)
  const restSum = rest.reduce((s, [, v]) => s + v, 0)

  const data: Datum[] = top.map(([name, value]) => ({
    name,
    value,
    colorIndex: CATEGORY_COLOR_INDEX.get(name) ?? null,
  }))
  if (restSum > 0) data.push({ name: OTHER, value: restSum, colorIndex: null })

  return data.sort((a, b) => a.value - b.value) // ascending so the biggest bar ends up on top
}

function CustomYAxisTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  return (
    <text x={x - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor" opacity={0.6}>
      {payload.value}
    </text>
  )
}

export function BankCategoryChart({ transactions }: { transactions: BankTransaction[] }) {
  const { locale } = useSettings()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const categorical = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  const otherColor  = isDark ? OTHER_DARK : OTHER_LIGHT

  const data = useMemo(() => buildData(transactions), [transactions])

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Ausgaben nach Kategorie
        </p>
        <p className="text-sm text-muted-foreground py-8 text-center">Keine Ausgaben im aktuellen Filter.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Ausgaben nach Kategorie
      </p>
      <ResponsiveContainer width="100%" height={Math.max(data.length * 34 + 16, 140)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={v => fmtCurrency(v as number, 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={<CustomYAxisTick x={0} y={0} payload={{ value: '' }} />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as Datum
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs">
                  <p className="text-foreground font-medium mb-0.5">{d.name}</p>
                  <p className="font-semibold tabular-nums text-muted-foreground">
                    {fmtCurrency(d.value, 'EUR', locale, { fractionDigits: 2 })}
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="value" radius={4} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.colorIndex === null ? otherColor : categorical[d.colorIndex]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
