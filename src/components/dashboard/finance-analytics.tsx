'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart,
} from 'recharts'
import { AlertTriangle, TrendingUp, Minus } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
import type { CategoryMonthSeries } from '@/lib/finance/flow-calc'

export type Summary = {
  id:               string
  user_id:          string
  month:            string
  salary:           number
  food:             number
  leisure:          number
  subscriptions:    number
  savings_transfer: number
  pocket_money:     number
  other_income:     number
  other_expenses:   number
  total_income:     number
  total_expenses:   number
  net_balance:      number | null
  source:           string
  created_at:       string
}

/** Spalten, die die Dashboard-Auswertung wirklich liest. Kommen aus `monthly_flows` (siehe flow-calc). */
export type SummaryRow = Pick<Summary, 'month' | 'total_income' | 'total_expenses' | 'net_balance'>

type Props = { summaries: SummaryRow[]; categorySeries: CategoryMonthSeries; locale: string }

function monthLabel(month: string, locale: string) {
  const dateStr = month.length <= 7 ? month + '-01' : month.slice(0, 10)
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

// ─── SSR-safe "mounted" flag ────────────────────────────────────────────────────
// Chart libs like recharts need real DOM measurements, so we render a placeholder
// on the server and swap in the chart once we're on the client. useSyncExternalStore
// (rather than useState+useEffect) avoids the extra commit that the naive pattern causes.
function subscribeNever() {
  return () => {}
}
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false)
}

function netBal(m: SummaryRow) {
  return m.net_balance ?? (m.total_income - m.total_expenses)
}

function abbr(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}

// Feste Reihenfolge statt fester Kategorienamen: die Hauptkategorien kommen aus den Daten.
const CAT_PALETTE = ['#f59e0b', '#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#94a3b8']
const catColor = (index: number, last: boolean) => (last ? '#94a3b8' : CAT_PALETTE[index % (CAT_PALETTE.length - 1)])

// ─── Shared card wrapper ────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">{children}</p>
}

// ─── Custom Tooltip (theme-aware via Tailwind, not hsl(var())) ─────────────────
function ChartTooltip({ active, payload, label, fmt }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover shadow-lg p-3 text-xs min-w-37.5">
      <p className="font-semibold text-popover-foreground mb-2">{label}</p>
      {payload.map(entry => (
        <div key={entry.name} className="flex items-center justify-between gap-3 mt-1">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="tabular-nums font-medium text-popover-foreground">{fmt(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── 1. Einnahmen vs. Ausgaben ─────────────────────────────────────────────────
// Exportiert (zusätzlich zum Re-Export über FinanceAnalytics unten) für den
// Landing-Mockup-Pilot (siehe DashboardMock.tsx, BarsChart) — dort wird nur
// dieser einzelne Chart gebraucht, nicht das komplette FinanceAnalytics-Bundle
// samt Kategorie-Chart und Monatsabweichungs-Tabelle.
export function IncomeExpenseChart({ summaries, locale, height = 200 }: { summaries: SummaryRow[]; locale: string; height?: number | `${number}%` }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)
  const mounted = useMounted()

  const data = [...summaries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(m => ({
      label:     monthLabel(m.month, locale),
      Einnahmen: m.total_income,
      Ausgaben:  m.total_expenses,
      Netto:     netBal(m),
    }))

  return (
    <Card>
      <SectionTitle>Einnahmen vs. Ausgaben</SectionTitle>
      {mounted ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={abbr}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', className: 'tabular-nums' }}
              axisLine={false} tickLine={false}
            />
            <ReTooltip
              content={<ChartTooltip fmt={fmt} />}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            {/* Theme-Variablen statt fester Hex-Werte — jedes Theme-Preset
                (siehe globals.css) definiert eigene --chart-income/-expense/
                -accent, damit z. B. Obsidian nicht Aurums Oliv/Terrakotta/Gold
                zeigt. */}
            <Bar dataKey="Einnahmen" fill="var(--chart-income)" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Ausgaben"  fill="var(--chart-expense)" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Line
              dataKey="Netto"
              stroke="var(--chart-accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--chart-accent)', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: 'var(--chart-accent)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height }} />
      )}
    </Card>
  )
}

// ─── 2. Ausgaben nach Hauptkategorie ───────────────────────────────────────────
function CategoryChart({ series, locale }: { series: CategoryMonthSeries; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const mounted = useMounted()

  function toggle(cat: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const cats = series.categories
  // Gestapelt: die zuletzt gezeichnete Kategorie liegt oben. Chips und Tooltip führen sie
  // in der Reihenfolge, in der man sie im Balken sieht (oben zuerst).
  const reihenfolge = anzeigeReihenfolge(cats)
  const colorFor = (cat: string) => catColor(cats.indexOf(cat), cat === series.otherKey)
  const data = series.months.slice(-6).map(m => ({
    label: monthLabel(m.month, locale),
    ...Object.fromEntries(cats.map(c => [c, m.values[c] ?? 0])),
  }))

  return (
    <Card>
      <SectionTitle>Ausgaben nach Hauptkategorie</SectionTitle>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {reihenfolge.map(cat => (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-opacity ${
              hidden.has(cat) ? 'opacity-25' : 'opacity-100'
            }`}
            style={{ borderColor: colorFor(cat), color: colorFor(cat) }}
          >
            <span className="size-1.5 rounded-full shrink-0" style={{ background: colorFor(cat) }} />
            {cat}
          </button>
        ))}
      </div>
      {mounted ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={abbr}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)', className: 'tabular-nums' }}
              axisLine={false} tickLine={false}
            />
            <ReTooltip
              content={<ChartTooltip fmt={fmt} />}
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
              itemSorter={tooltipSortierer(reihenfolge)}
            />
            {cats.filter(cat => !hidden.has(cat)).map(cat => (
              <Bar key={cat} dataKey={cat} stackId="a" fill={colorFor(cat)} fillOpacity={0.85} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 200 }} />
      )}
    </Card>
  )
}

// ─── 3. Monatliche Abweichung ──────────────────────────────────────────────────
function DeviationTable({ summaries, locale }: { summaries: SummaryRow[]; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

  const sorted = [...summaries].sort((a, b) => b.month.localeCompare(a.month))
  const multiMonth = sorted.length > 1

  const { avg, stddev } = useMemo(() => {
    if (sorted.length === 0) return { avg: 0, stddev: 0 }
    const a  = sorted.reduce((s, m) => s + netBal(m), 0) / sorted.length
    const sd = Math.sqrt(sorted.reduce((s, m) => s + (netBal(m) - a) ** 2, 0) / sorted.length)
    return { avg: a, stddev: sd }
  }, [sorted])

  const extremeThreshold = multiMonth ? Math.max(stddev * 1.5, Math.abs(avg) * 0.3) : 0

  return (
    <Card>
      <SectionTitle>
        Monatliche Abweichung
        {multiMonth && <span className="ml-1 normal-case font-normal tabular-nums">· Ø {fmt(avg)} / Monat</span>}
      </SectionTitle>
      <div className="space-y-1.5">
        {sorted.map(m => {
          const nb          = netBal(m)
          const dev         = nb - avg
          const isPositive  = nb >= 0
          const isGoodMonth = multiMonth && dev >  extremeThreshold
          const isBadMonth  = multiMonth && dev < -extremeThreshold

          return (
            <div
              key={m.month}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm border ${
                isBadMonth  ? 'bg-danger/10 border-danger/25'   :
                isGoodMonth ? 'bg-success/10 border-success/25' :
                              'bg-muted/20 border-transparent'
              }`}
            >
              {/* Icon */}
              <div className="w-4 shrink-0">
                {isBadMonth  ? <AlertTriangle className="size-3.5 text-danger"   /> :
                 isGoodMonth ? <TrendingUp    className="size-3.5 text-success" /> :
                               <Minus className="size-3 text-muted-foreground/30" />}
              </div>

              {/* Monat */}
              <span className="w-16 shrink-0 text-xs font-medium text-foreground">
                {monthLabel(m.month, locale)}
              </span>

              {/* Einnahmen / Ausgaben */}
              <span className="flex-1 text-xs text-muted-foreground hidden sm:block tabular-nums">
                <span className="text-success">{fmt(m.total_income)}</span>
                {' / '}
                <span className="text-danger">{fmt(m.total_expenses)}</span>
              </span>

              {/* Netto */}
              <span className={`w-24 text-right text-xs font-semibold tabular-nums shrink-0 ${
                isPositive ? 'text-success' : 'text-danger'
              }`}>
                {isPositive ? '+' : ''}{fmt(nb)}
              </span>

              {/* Abweichung vs. Ø – nur mit mehreren Monaten sinnvoll */}
              {multiMonth && (
                <span className={`w-24 text-right text-xs tabular-nums shrink-0 ${
                  dev > 0 ? 'text-success' :
                  dev < 0 ? 'text-danger'   : 'text-muted-foreground'
                }`}>
                  {dev > 0 ? '+' : ''}{fmt(dev)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {multiMonth && extremeThreshold > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          Extremereignis · Abweichung &gt; {fmt(extremeThreshold)} vom Ø
        </p>
      )}
    </Card>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────
export function FinanceAnalytics({ summaries, categorySeries, locale }: Props) {
  if (summaries.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">
        Finanzanalyse
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          letzte {summaries.length} Monat{summaries.length !== 1 ? 'e' : ''} · ohne Anlagen und Forderungen
        </span>
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncomeExpenseChart summaries={summaries} locale={locale} />
        <CategoryChart      series={categorySeries} locale={locale} />
      </div>

      <DeviationTable summaries={summaries} locale={locale} />
    </div>
  )
}
