'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { computeKDE, computePercentileRank } from '@/lib/kde'

/** Unter dieser Monatszahl ist eine KDE nicht verlässlich genug, um sie als
    Kurve zu zeigen — lieber ehrlich "noch nicht genug Historie" als eine
    wacklige Kurve aus z. B. 3 Punkten. */
const MIN_MONTHS = 12

interface Props {
  /** Abgeschlossene Monate (Gesamtausgaben, kategorieunabhängig) — der
      laufende Monat gehört NICHT hierhinein, sonst würde die Kurve durch
      einen zwangsläufig unvollständigen Wert verzerrt. */
  historicalExpenses: number[]
  /** Gesamtausgaben des laufenden Monats, oder `null` ohne Buchungen bisher. */
  currentMonthExpense: number | null
}

function DistributionTooltip({ active, payload }: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
}) {
  if (!active || !payload?.length) return null
  const x = payload[0]?.payload?.x as number | undefined
  if (x == null) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg text-xs">
      <span className="text-popover-foreground font-medium tabular-nums">
        {x.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €
      </span>
    </div>
  )
}

export function AusgabenVerteilung({ historicalExpenses, currentMonthExpense }: Props) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const kde = useMemo(
    () => (historicalExpenses.length >= MIN_MONTHS ? computeKDE(historicalExpenses) : null),
    [historicalExpenses],
  )

  const percentile  = kde && currentMonthExpense != null ? computePercentileRank(historicalExpenses, currentMonthExpense) : null
  const countBelow  = currentMonthExpense != null ? historicalExpenses.filter(v => v < currentMonthExpense).length : null
  const elevated    = percentile != null && percentile > 75
  // --destructive ist in jedem Theme byte-identisch mit --chart-expense (beide
  // sind der "Ausgaben/Negativ"-Ton des Presets) — als Marker-Farbe wäre die
  // "kippt zu Rot"-Warnung dadurch von der Kurve selbst nicht zu unterscheiden.
  // --foreground kontrastiert garantiert gegen jede Chart-Expense-Farbe.
  const markerColor = elevated ? 'var(--foreground)' : 'var(--chart-accent)'

  if (!kde) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-2">Ausgabenverteilung</h2>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Noch nicht genug Datenhistorie für eine verlässliche Verteilung
          {historicalExpenses.length > 0 && ` — ${historicalExpenses.length} von ${MIN_MONTHS} Monaten vorhanden`}.
        </p>
      </div>
    )
  }

  const maxDensity = Math.max(...kde.map(p => p.density))

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-0.5">
        <h2 className="text-sm font-medium text-foreground">Ausgabenverteilung</h2>
        {percentile != null && countBelow != null && (
          <p className="text-xs font-semibold text-right" style={{ color: markerColor }}>
            {percentile}. Perzentil — höher als in {countBelow} von {historicalExpenses.length} Monaten
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Monatliche Gesamtausgaben, letzte {historicalExpenses.length} Monate
      </p>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={kde} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="kde-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-expense)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-expense)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => fmt(v as number)}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          {/* Dichtewerte selbst sind für Nutzer nicht intuitiv interpretierbar
              — die Kurvenform + Marker-Position sind die eigentliche
              Information, deshalb bleibt die Y-Achse unsichtbar. */}
          <YAxis hide domain={[0, maxDensity * 1.15]} />
          <Tooltip content={<DistributionTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="density"
            stroke="var(--chart-expense)"
            strokeWidth={2}
            fill="url(#kde-gradient)"
          />
          {currentMonthExpense != null && (
            <ReferenceLine
              x={currentMonthExpense}
              stroke={markerColor}
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{ value: 'Dieser Monat', position: 'top', fill: markerColor, fontSize: 11, fontWeight: 600 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
