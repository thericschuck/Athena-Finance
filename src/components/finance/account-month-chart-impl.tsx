'use client'

import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { useUrlFilters } from '@/components/providers/url-filters'
import { fmtCurrency } from '@/lib/format'
import type { MonthDatum } from './account-month-chart'

// Dieselben Theme-Variablen wie überall sonst, wo Geld gecharted wird.
const INCOME  = 'var(--chart-income)'
const EXPENSE = 'var(--chart-expense)'
// Netto ist weder Einnahme noch Ausgabe — mit einer der beiden Farben sähe die Linie je
// nach Vorzeichen mal richtig, mal irreführend aus.
const NET = 'var(--foreground)'

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

export function AccountMonthChart({
  data, currency, selectedMonth,
}: {
  data: MonthDatum[]
  currency: string
  selectedMonth?: string | null
}) {
  const { locale } = useSettings()
  // Unbedingt aufgerufen — Hooks duerfen nicht bedingt laufen. Die Seite, die diesen Chart
  // einbindet, liegt in einem UrlFiltersProvider (siehe Prop-Doku im Wrapper).
  const filters = useUrlFilters()
  const selectable = selectedMonth !== undefined
  const fmt = (n: number, digits = 2) => fmtCurrency(n, currency, locale, { fractionDigits: digits })

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        // Auf dem Chart statt auf den Balken: so trifft man die ganze Spalte, auch die
        // Luecke zwischen Einnahme- und Ausgabebalken und den Bereich ueber kurzen Saeulen.
        onClick={selectable
          ? (state: { activeLabel?: string | number }) => {
              const m = state?.activeLabel
              if (typeof m !== 'string') return
              filters.set('month', m === selectedMonth ? null : m)
            }
          : undefined}
        style={selectable ? { cursor: 'pointer' } : undefined}
      >
        <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={v => monthLabel(v as string, locale)}
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
          axisLine={false} tickLine={false} minTickGap={16}
        />
        <YAxis
          tickFormatter={v => fmt(Math.abs(v as number), 0)}
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
          axisLine={false} tickLine={false} width={56}
        />
        <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
        <Tooltip
          cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as MonthDatum
            return (
              <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs min-w-[150px]">
                <p className="text-foreground font-medium mb-1">{monthLabel(label as string, locale)}</p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Einnahmen</span>
                  <span className="font-semibold tabular-nums" style={{ color: INCOME }}>+{fmt(d.income)}</span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Ausgaben</span>
                  <span className="font-semibold tabular-nums" style={{ color: EXPENSE }}>{fmt(d.expense)}</span>
                </p>
                <p className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-border">
                  <span className="text-muted-foreground">Netto</span>
                  <span className={`font-semibold tabular-nums ${d.net >= 0 ? 'text-success' : 'text-danger'}`}>
                    {d.net >= 0 ? '+' : ''}{fmt(d.net)}
                  </span>
                </p>
              </div>
            )
          }}
        />
        {/* isAnimationActive={false}: bei jedem Zeitraumwechsel wird der komplette Datensatz
            ersetzt, und recharts animiert dann sämtliche Balken neu. */}
        {/* Cells statt einer festen fill-Farbe: nur so laesst sich der gewaehlte Monat
            hervorheben. Nicht gewaehlte werden zurueckgenommen statt eingegraut — sie
            bleiben lesbar und der Vergleich funktioniert weiter. */}
        <Bar dataKey="income"  fill={INCOME}  radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
          {data.map(d => (
            <Cell key={d.month} fillOpacity={!selectedMonth || d.month === selectedMonth ? 1 : 0.28} />
          ))}
        </Bar>
        {/* radius auch hier [4, 4, 0, 0] und nicht [0, 0, 4, 4]: recharts zaehlt die Ecken ab
            dem Rechteck-Ursprung, und der liegt bei negativer Hoehe am UNTEREN Balkenende
            (y = Wert unterhalb der Nulllinie, height = negativ). Index 0/1 sind bei einem
            Ausgabebalken also unten, 2/3 an der Nulllinie — [0, 0, 4, 4] rundete die Saeule
            deshalb oben ab statt unten. */}
        <Bar dataKey="expense" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
          {data.map(d => (
            <Cell key={d.month} fillOpacity={!selectedMonth || d.month === selectedMonth ? 1 : 0.28} />
          ))}
        </Bar>
        {/* Netto zuletzt, damit die Linie über den Balken liegt. Gestrichelt, weil sie eine
            abgeleitete Größe zeigt und keine dritte Messreihe. */}
        <Line
          type="monotone"
          dataKey="net"
          stroke={NET}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 2.5, fill: NET, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
