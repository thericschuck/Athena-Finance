'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { FinanceCategory } from '@/types/bank'
import { rollupByRoot, UNCATEGORIZED as UNCAT_FLOW, type FlowInclude, type FlowRow } from '@/lib/finance/flow-calc'

const UNCATEGORIZED_COLOR = 'var(--chart-muted-1)'
const OTHER_COLOR = 'var(--chart-muted-2)'

const UNCATEGORIZED = 'Ohne Kategorie'
const OTHER = 'Andere'
// War 5 — bei mehr als 5 Ausgabenkategorien landete der Großteil in einem einzigen
// unspezifischen "Andere"-Balken. 8 zeigt deutlich mehr Kategorien einzeln, bevor der
// Rest gebündelt wird, ohne den Chart bei einer üblichen Kontoübersicht zu sprengen.
const MAX_SLOTS = 8

type Mode = 'ausgaben' | 'einnahmen'

interface Datum { name: string; value: number; color: string }

// Hauptkategorien aus `monthly_flows` (siehe flow-calc.rollupByRoot). Die Farbe kommt von der
// Kategorie selbst (unter /finance/categories gesetzt), damit der Balken hier genauso aussieht
// wie überall sonst in der App.
function buildData(rows: FlowRow[], include: FlowInclude, categories: FinanceCategory[], mode: Mode): Datum[] {
  const byId = new Map(categories.map(c => [c.id, c]))
  const rolled = rollupByRoot(rows, include, mode === 'ausgaben' ? 'expense' : 'income')
  const value = (r: { income: number; expense: number }) => (mode === 'ausgaben' ? r.expense : r.income)

  const top = rolled.slice(0, MAX_SLOTS)
  const restSum = rolled.slice(MAX_SLOTS).reduce((s, r) => s + value(r), 0)

  const data: Datum[] = top.map(r => {
    const cat = r.id ? byId.get(r.id) : undefined
    return {
      name: r.name === UNCAT_FLOW ? UNCATEGORIZED : `${cat?.icon ?? ''} ${r.name}`.trim(),
      value: value(r),
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

export function BankCategoryChart({ rows, include, categories }: { rows: FlowRow[]; include: FlowInclude; categories: FinanceCategory[] }) {
  const { locale } = useSettings()
  const [mode, setMode] = useState<Mode>('ausgaben')

  const data = useMemo(() => buildData(rows, include, categories, mode), [rows, include, categories, mode])

  const header = (
    <div className="mb-4 flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {mode === 'ausgaben' ? 'Ausgaben nach Kategorie' : 'Einnahmen nach Kategorie'}
      </p>
      <div className="flex gap-1">
        {(['ausgaben', 'einnahmen'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              mode === m
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {m === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'}
          </button>
        ))}
      </div>
    </div>
  )

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        {header}
        <p className="text-sm text-muted-foreground py-8 text-center">
          {mode === 'ausgaben' ? 'Keine Ausgaben im aktuellen Filter.' : 'Keine Einnahmen im aktuellen Filter.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {header}
      <ResponsiveContainer width="100%" height={Math.max(data.length * 34 + 16, 140)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={v => fmtCurrency(v as number, 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
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
          {/* Ohne das animiert recharts bei jedem Zeitraumwechsel alle Balken neu. */}
          <Bar dataKey="value" radius={4} maxBarSize={22} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={`${d.name}-${i}`} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
