'use client'

import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { fmtCurrency } from '@/lib/format'

const SLICES = [
  { key: 'Finanzen',  color: '#3b82f6' },
  { key: 'Depot',     color: '#10b981' },
  { key: 'Krypto',    color: '#f59e0b' },
  { key: 'Sparziele', color: '#8b5cf6' },
]

type Props = {
  financeTotal: number
  depotTotal:   number
  cryptoTotal:  number
  savingsTotal: number
  locale:       string
}

export function PortfolioDonut({ financeTotal, depotTotal, cryptoTotal, savingsTotal, locale }: Props) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

  const data = [
    { ...SLICES[0], value: financeTotal },
    { ...SLICES[1], value: depotTotal   },
    { ...SLICES[2], value: cryptoTotal  },
    { ...SLICES[3], value: savingsTotal },
  ].filter(d => d.value > 0)

  const total = data.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Portfolio-Verteilung</p>

      <div className="flex flex-col items-center gap-5">
        {/* Donut */}
        <div className="relative w-36 h-36 shrink-0">
          <PieChart width={144} height={144}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={64}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                formatter={(val: number | undefined) => [fmt(val ?? 0), '' as const]}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ display: 'none' }}
              />
            </PieChart>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] text-muted-foreground">Gesamt</p>
            <p className="text-sm font-bold tabular-nums leading-tight">
              {total >= 100_000
                ? `${(total / 1000).toFixed(0)}k`
                : fmt(total).replace(' €', '€')}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-2">
          {data.map(item => {
            const pct = Math.round((item.value / total) * 100)
            return (
              <div key={item.key} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-muted-foreground flex-1">{item.key}</span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
                <span className="text-xs font-semibold tabular-nums">{fmt(item.value)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}