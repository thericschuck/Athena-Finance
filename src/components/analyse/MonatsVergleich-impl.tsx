'use client'

import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyComparison } from '@/lib/analyseData'

interface Props { data: MonthlyComparison[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-xl text-xs min-w-37">
      <p className="font-semibold text-popover-foreground mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Einnahmen</span>
          <span className="text-(--chart-income) font-medium tabular-nums">
            {(get('einnahmen') as number)?.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Ausgaben</span>
          <span className="text-(--chart-expense) font-medium tabular-nums">
            {(get('ausgaben') as number)?.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-border">
          <span className="text-muted-foreground">Sparquote</span>
          <span className="text-(--chart-accent) font-semibold">{get('sparquote')} %</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Achsenbereich der Sparquote.
 *
 * Vorher fest [0, 60]: alles darunter (ein Monat mit mehr Ausgaben als Einnahmen) und alles
 * darüber (ein Monat mit einer großen Einmalzahlung) lief außerhalb des Bildes und die Linie
 * verschwand am Rand. Untergrenze bei −100 % gedeckelt, weil ein einzelner Ausreißer wie
 * −339 % sonst alle übrigen Monate zu einer flachen Linie zusammendrückt — der Tooltip nennt
 * den echten Wert weiterhin.
 */
function sparquoteDomain(data: MonthlyComparison[]): [number, number] {
  if (data.length === 0) return [0, 60]
  const werte = data.map(d => d.sparquote)
  const min = Math.max(-100, Math.min(0, ...werte))
  const max = Math.max(60, ...werte)
  // Auf 20er-Schritte runden, damit die Ticks glatte Zahlen zeigen.
  return [Math.floor(min / 20) * 20, Math.ceil(max / 20) * 20]
}

export function MonatsVergleich({ data }: Props) {
  const pctDomain = sparquoteDomain(data)

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-foreground">Monatlicher Vergleich</h2>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-income) opacity-80" />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-expense) opacity-80" />
            Ausgaben
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5 bg-(--chart-accent)" />
            Sparquote
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="eur"
            tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={pctDomain}
            width={44}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
          />
          <Bar
            yAxisId="eur"
            dataKey="einnahmen"
            fill="var(--chart-income)"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            yAxisId="eur"
            dataKey="ausgaben"
            fill="var(--chart-expense)"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="sparquote"
            stroke="var(--chart-accent)"
            strokeWidth={2}
            dot={{ fill: 'var(--chart-accent)', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--chart-accent)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
