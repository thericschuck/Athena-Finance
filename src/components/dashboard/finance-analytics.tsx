'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart,
} from 'recharts'
import { AlertTriangle, TrendingUp, Minus } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'

type Summary = {
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

type Props = { summaries: Summary[]; locale: string }

function monthLabel(month: string, locale: string) {
  const dateStr = month.length <= 7 ? month + '-01' : month.slice(0, 10)
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

function netBal(m: Summary) {
  return m.net_balance ?? (m.total_income - m.total_expenses)
}

function abbr(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}

const CAT_COLORS: Record<string, string> = {
  Lebensmittel: '#f59e0b',
  Freizeit:     '#8b5cf6',
  Abos:         '#3b82f6',
  Taschengeld:  '#ec4899',
  Sonstiges:    '#94a3b8',
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover shadow-lg p-3 text-xs min-w-37.5">
      <p className="font-semibold text-popover-foreground mb-2">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
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
function IncomeExpenseChart({ summaries, locale }: { summaries: Summary[]; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

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
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={abbr}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false}
          />
          <ReTooltip
            content={<ChartTooltip fmt={fmt} />}
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="Einnahmen" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Bar dataKey="Ausgaben"  fill="#ef4444" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Line
            dataKey="Netto"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#6366f1' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

const ALL_CATS = ['Lebensmittel', 'Freizeit', 'Abos', 'Taschengeld', 'Sonstiges'] as const
type Cat = typeof ALL_CATS[number]

// ─── 2. Ausgaben nach Kategorien ───────────────────────────────────────────────
function CategoryChart({ summaries, locale }: { summaries: Summary[]; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)
  const [active, setActive] = useState<Set<Cat>>(new Set(ALL_CATS))

  function toggle(cat: Cat) {
    setActive(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const data = [...summaries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(m => ({
      label:        monthLabel(m.month, locale),
      Lebensmittel: m.food,
      Freizeit:     m.leisure,
      Abos:         m.subscriptions,
      Taschengeld:  m.pocket_money,
      Sonstiges:    m.other_expenses,
    }))

  return (
    <Card>
      <SectionTitle>Ausgaben nach Kategorie</SectionTitle>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ALL_CATS.map(cat => (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-opacity ${
              active.has(cat) ? 'opacity-100' : 'opacity-25'
            }`}
            style={{ borderColor: CAT_COLORS[cat], color: CAT_COLORS[cat] }}
          >
            <span className="size-1.5 rounded-full shrink-0" style={{ background: CAT_COLORS[cat] }} />
            {cat}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={abbr}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false}
          />
          <ReTooltip
            content={<ChartTooltip fmt={fmt} />}
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
          />
          {ALL_CATS.filter(cat => active.has(cat)).map(cat => (
            <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[cat]} fillOpacity={0.85} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ─── 3. Monatliche Abweichung ──────────────────────────────────────────────────
function DeviationTable({ summaries, locale }: { summaries: Summary[]; locale: string }) {
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
        {multiMonth && <span className="ml-1 normal-case font-normal">· Ø {fmt(avg)} / Monat</span>}
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
                isBadMonth  ? 'bg-red-500/10   border-red-500/25'   :
                isGoodMonth ? 'bg-green-500/10 border-green-500/25' :
                              'bg-muted/20 border-transparent'
              }`}
            >
              {/* Icon */}
              <div className="w-4 shrink-0">
                {isBadMonth  ? <AlertTriangle className="size-3.5 text-red-500"   /> :
                 isGoodMonth ? <TrendingUp    className="size-3.5 text-green-500" /> :
                               <Minus className="size-3 text-muted-foreground/30" />}
              </div>

              {/* Monat */}
              <span className="w-16 shrink-0 text-xs font-medium text-foreground">
                {monthLabel(m.month, locale)}
              </span>

              {/* Einnahmen / Ausgaben */}
              <span className="flex-1 text-xs text-muted-foreground hidden sm:block">
                <span className="text-green-500">{fmt(m.total_income)}</span>
                {' / '}
                <span className="text-red-500">{fmt(m.total_expenses)}</span>
              </span>

              {/* Netto */}
              <span className={`w-24 text-right text-xs font-semibold tabular-nums shrink-0 ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}>
                {isPositive ? '+' : ''}{fmt(nb)}
              </span>

              {/* Abweichung vs. Ø – nur mit mehreren Monaten sinnvoll */}
              {multiMonth && (
                <span className={`w-24 text-right text-xs tabular-nums shrink-0 ${
                  dev > 0 ? 'text-green-500' :
                  dev < 0 ? 'text-red-500'   : 'text-muted-foreground'
                }`}>
                  {dev > 0 ? '+' : ''}{fmt(dev)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {multiMonth && extremeThreshold > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Extremereignis · Abweichung &gt; {fmt(extremeThreshold)} vom Ø
        </p>
      )}
    </Card>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────
export function FinanceAnalytics({ summaries, locale }: Props) {
  if (summaries.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">
        Finanzanalyse
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          letzte {summaries.length} Monat{summaries.length !== 1 ? 'e' : ''}
        </span>
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncomeExpenseChart summaries={summaries} locale={locale} />
        <CategoryChart      summaries={summaries} locale={locale} />
      </div>

      <DeviationTable summaries={summaries} locale={locale} />
    </div>
  )
}
