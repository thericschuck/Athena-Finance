'use client'

import { useMemo, useSyncExternalStore } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────
// Deckungsgleich mit dem `showChart`-Werkzeug in src/lib/assistant/tools/chart.ts —
// Änderungen an der Form dort immer hier nachziehen.
export type ChartUnit = 'eur' | 'percent' | 'count'
export type ChartKind = 'line' | 'bar' | 'donut'

export type ChartPoint = { x: string; y: number; y2?: number }

export type ChartSpec = {
  type: ChartKind
  title: string
  unit?: ChartUnit
  seriesLabel?: string
  series2Label?: string
  points: ChartPoint[]
}

// ─── SSR-safe "mounted" flag ────────────────────────────────────────────────────
// Gleiches Muster wie net-worth-chart.tsx: recharts braucht echte DOM-Maße, also
// erst nach dem Mount rendern statt einen Server/Client-Mismatch zu riskieren.
function subscribeNever() {
  return () => {}
}
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false)
}

function fmtValue(v: number, unit: ChartUnit, locale: string): string {
  if (unit === 'percent') return `${v.toLocaleString(locale, { maximumFractionDigits: 1 })} %`
  if (unit === 'count') return v.toLocaleString(locale)
  return fmtCurrency(v, 'EUR', locale, { fractionDigits: 0 })
}

function fmtAxis(v: number, unit: ChartUnit): string {
  if (unit === 'percent') return `${v}%`
  if (unit === 'count') return String(v)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

/** Datumsartige x-Werte (YYYY-MM oder YYYY-MM-DD) kurz formatieren, alles
    andere (Kategorienamen) unverändert lassen — ein Chart über Kategorien
    braucht keine Datumsinterpretation. */
function fmtX(v: string, locale: string): string {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(v)) return v
  const d = new Date(v.length === 7 ? `${v}-01` : v)
  if (Number.isNaN(d.getTime())) return v
  return v.length === 7
    ? d.toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })
    : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

const DONUT_COLORS = [
  'var(--chart-cat-1)', 'var(--chart-cat-2)', 'var(--chart-cat-3)',
  'var(--chart-cat-4)', 'var(--chart-cat-5)', 'var(--chart-cat-6)',
]

function ChartTooltip({ active, payload, label, unit, locale }: {
  active?: boolean
  payload?: Array<{ dataKey: string; name?: string; value: number; color?: string }>
  label?: string | number
  unit: ChartUnit
  locale: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-md">
      {label != null && <p className="mb-1 font-medium text-foreground">{fmtX(String(label), locale)}</p>}
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name ?? p.dataKey}
            </span>
            <span className="font-medium tabular-nums text-foreground">{fmtValue(p.value, unit, locale)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Rendert die Ausgabe von Athenas `showChart`-Werkzeug als echtes Recharts-Diagramm
 * statt als generiertes Bild — die Zahlen kommen 1:1 aus dem Werkzeug-Ergebnis, das
 * Athena vorher gelesen hat, es wird nichts neu "gemalt" oder geschätzt.
 *
 * Bewusst deutlich kompakter als die Dashboard-Charts (net-worth-chart.tsx & Co.):
 * kein Tab-/Filter-Header, kein Grid, dünne Linien — das hier steht in einer
 * Chat-Blase und soll die Kürze der Antwort tragen, nicht mit ihr konkurrieren.
 */
export function AthenaChart({ spec }: { spec: ChartSpec }) {
  const { locale } = useSettings()
  const mounted = useMounted()
  const unit = spec.unit ?? 'eur'
  const hasSecondSeries = spec.type !== 'donut' && spec.points.some((p) => p.y2 != null)

  // Stabile Referenz statt `spec.points` direkt: solange Athena nach dem Chart
  // weiterschreibt, wird die ganze Nachricht (inklusive des schon fertigen
  // Tool-Ergebnisses) bei jedem gestreamten Wort neu aus dem Stream
  // deserialisiert — `spec` kommt dann mit neuer Objekt-Identität, aber
  // gleichem Inhalt. Ohne diesen Umweg hält recharts das für "neue Daten" und
  // startet bei jedem Token die Eintritts-Animation neu, was JSDOM/React in
  // eine Update-Schleife treibt ("Maximum update depth exceeded").
  const pointsKey = JSON.stringify(spec.points)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pointsKey ist der Inhalts-Schlüssel, spec.points nur der Wert
  const data = useMemo(() => spec.points, [pointsKey])

  const HEIGHT = 180

  if (data.length === 0) return null

  if (!mounted) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{spec.title}</p>
        <div style={{ height: HEIGHT }} />
      </div>
    )
  }

  return (
    <div className="mt-2 max-w-md rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{spec.title}</p>
        {hasSecondSeries && (
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: 'var(--chart-accent)' }} />
              {spec.seriesLabel ?? 'Reihe 1'}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: 'var(--chart-expense)' }} />
              {spec.series2Label ?? 'Reihe 2'}
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={HEIGHT}>
        {spec.type === 'donut' ? (
          <PieChart>
            <Pie
              data={data}
              dataKey="y"
              nameKey="x"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <ChartTooltip
                    active
                    unit={unit}
                    locale={locale}
                    payload={[{
                      dataKey: 'y',
                      name: payload[0].payload.x,
                      value: payload[0].payload.y,
                      color: payload[0].payload.fill,
                    }]}
                  />
                ) : null
              }
            />
          </PieChart>
        ) : spec.type === 'bar' ? (
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="x"
              tickFormatter={(v: string) => fmtX(v, locale)}
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => fmtAxis(v, unit)}
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={(p) => (
                <ChartTooltip
                  {...p}
                  unit={unit}
                  locale={locale}
                  payload={p.payload?.map((entry) => ({
                    dataKey: String(entry.dataKey),
                    name: entry.dataKey === 'y2' ? spec.series2Label ?? 'Reihe 2' : spec.seriesLabel ?? 'Reihe 1',
                    value: Number(entry.value),
                    color: entry.dataKey === 'y2' ? 'var(--chart-expense)' : 'var(--chart-accent)',
                  }))}
                />
              )}
              cursor={{ fill: 'currentColor', opacity: 0.05 }}
            />
            <Bar
              dataKey="y"
              fill="var(--chart-accent)"
              radius={[3, 3, 0, 0]}
              maxBarSize={hasSecondSeries ? 16 : 28}
              isAnimationActive={false}
            />
            {hasSecondSeries && (
              <Bar
                dataKey="y2"
                fill="var(--chart-expense)"
                radius={[3, 3, 0, 0]}
                maxBarSize={16}
                isAnimationActive={false}
              />
            )}
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="athenaChartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-accent)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--chart-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="x"
              tickFormatter={(v: string) => fmtX(v, locale)}
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => fmtAxis(v, unit)}
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={(p) => (
                <ChartTooltip
                  {...p}
                  unit={unit}
                  locale={locale}
                  payload={p.payload?.map((entry) => ({
                    dataKey: String(entry.dataKey),
                    name: spec.seriesLabel ?? spec.title,
                    value: Number(entry.value),
                    color: 'var(--chart-accent)',
                  }))}
                />
              )}
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="y"
              stroke="var(--chart-accent)"
              strokeWidth={2}
              fill="url(#athenaChartGradient)"
              dot={false}
              activeDot={{ r: 3.5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>

      {spec.type === 'donut' && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {data.map((p, i) => (
            <span key={p.x} className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
              <span
                className="size-2 rounded-full"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              {p.x} · {fmtValue(p.y, unit, locale)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
