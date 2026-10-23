'use client'

// Recharts-dependent rendering split out of portfolio-chart.tsx so it can be
// loaded on demand via next/dynamic (react-doctor/prefer-dynamic-import) —
// recharts is a heavy dependency and this chart is non-critical, below-the-fold UI.

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'

// Theme-Kategorienpalette (siehe --chart-cat-* in globals.css) statt fixer
// Hex-Werte — zieht pro aktivem Dashboard-Theme mit, statt überall Aurums
// Oliv/Gold/Terrakotta zu zeigen.
const COLORS = [
  'var(--chart-cat-1)', 'var(--chart-cat-2)', 'var(--chart-cat-3)',
  'var(--chart-cat-4)', 'var(--chart-cat-5)', 'var(--chart-cat-6)',
]

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

// ─── Public export ────────────────────────────────────────────────────────────
export function PortfolioAreaChart({
  chartData, visiblePortfolios, xFormatter, tickInterval, height = 300,
}: {
  chartData: Array<Record<string, string | number>>
  visiblePortfolios: string[]
  xFormatter: (v: string) => string
  tickInterval: number
  height?: number | `${number}%`
}) {
  // Gestapelt: die zuletzt gezeichnete Fläche liegt oben. Legende und Tooltip führen sie
  // in der Reihenfolge, in der man sie im Chart sieht (oben zuerst).
  const reihenfolge = anzeigeReihenfolge(visiblePortfolios)
  return (
    <ResponsiveContainer width="100%" height={height}>
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
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} itemSorter={tooltipSortierer(reihenfolge)} />
        {visiblePortfolios.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px', opacity: 0.7 }}
            itemSorter={item => reihenfolge.indexOf(String(item.dataKey ?? item.value))}
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
  )
}
