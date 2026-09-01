'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { CategoryDatum } from '@/lib/analyseData'

interface Props { data: CategoryDatum[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]?.payload as CategoryDatum
  const isIncome = value >= 0
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-xl text-xs">
      <p className="text-popover-foreground font-medium mb-0.5">{name}</p>
      <p className={`font-semibold tabular-nums ${isIncome ? 'text-(--chart-income)' : 'text-(--chart-expense)'}`}>
        {isIncome ? '+' : ''}{Math.abs(value).toLocaleString('de-DE')} €
      </p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomYAxisTick({ x, y, payload }: any) {
  return (
    <text x={x - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
      {payload.value}
    </text>
  )
}

export function KategorienChart({ data }: Props) {
  // Sort: income desc at top, expenses desc (most negative at bottom)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const maxAbs  = Math.max(...sorted.map(d => Math.abs(d.value)))
  const domain  = [-maxAbs * 1.1, maxAbs * 1.1]

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-foreground">Einnahmen & Ausgaben nach Kategorie</h2>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-income) opacity-75" />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-expense) opacity-75" />
            Ausgaben
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={sorted.length * 36 + 24}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={v => `${Math.round(Math.abs(v as number) / 1000 * 10) / 10}k`}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={<CustomYAxisTick />}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }} />
          <Bar dataKey="value" radius={4} maxBarSize={22}>
            {sorted.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.value >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)'}
                fillOpacity={0.78}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
