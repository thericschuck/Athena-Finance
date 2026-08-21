'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { BankTransaction, FinanceCategory } from '@/types/bank'

const UNCATEGORIZED_COLOR = '#93877a'
const OTHER_COLOR = '#5b5147'

const UNCATEGORIZED = 'Ohne Kategorie'
const OTHER = 'Andere'
const MAX_SLOTS = 5

interface Datum { name: string; value: number; color: string }

// Uses each category's OWN color (set by the user under /finance/categories) instead of a
// synthetic palette — these are the real Finance categories, so the bar should look the same
// color here as it does everywhere else in the app.
function buildData(transactions: BankTransaction[], categories: FinanceCategory[]): Datum[] {
  const byId = new Map(categories.map(c => [c.id, c]))
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.amount >= 0) continue // expenses only
    // Orphaned category_id (category was deleted) falls back to the same bucket as
    // "no category" — otherwise both would render under the "Ohne Kategorie" label
    // as separate bars with a duplicate key.
    const key = tx.category_id && byId.has(tx.category_id) ? tx.category_id : UNCATEGORIZED
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(tx.amount))
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, MAX_SLOTS)
  const rest = sorted.slice(MAX_SLOTS)
  const restSum = rest.reduce((s, [, v]) => s + v, 0)

  const data: Datum[] = top.map(([key, value]) => {
    const cat = byId.get(key)
    return {
      name: cat ? `${cat.icon ?? ''} ${cat.name}`.trim() : UNCATEGORIZED,
      value,
      color: cat?.color ?? UNCATEGORIZED_COLOR,
    }
  })
  if (restSum > 0) data.push({ name: OTHER, value: restSum, color: OTHER_COLOR })

  return data.sort((a, b) => a.value - b.value) // ascending so the biggest bar ends up on top
}

function CustomYAxisTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  return (
    <text x={x - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor" opacity={0.6}>
      {payload.value}
    </text>
  )
}

export function BankCategoryChart({ transactions, categories }: { transactions: BankTransaction[]; categories: FinanceCategory[] }) {
  const { locale } = useSettings()

  const data = useMemo(() => buildData(transactions, categories), [transactions, categories])

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
              <Cell key={`${d.name}-${i}`} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
