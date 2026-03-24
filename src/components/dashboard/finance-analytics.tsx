'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  BarChart, Legend,
} from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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

type Props = {
  summaries: Summary[]
  locale:    string
}

function monthLabel(month: string, locale: string) {
  // month can be "2026-03" or "2026-03-01" — normalise to a valid date string
  const dateStr = month.length <= 7 ? month + '-01' : month.slice(0, 10)
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

function netBal(m: Summary) {
  // net_balance may not be stored by the cron — compute from totals as fallback
  return m.net_balance ?? (m.total_income - m.total_expenses)
}

function abbr(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}

const CAT_COLORS: Record<string, string> = {
  Gehalt:     '#10b981',
  Lebensmittel: '#f59e0b',
  Freizeit:   '#8b5cf6',
  Abos:       '#3b82f6',
  Taschengeld: '#ec4899',
  Sonstiges:  '#6b7280',
}

// ─── Card wrapper ──────────────────────────────────────────────────────────────
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

// ─── Tooltip styles ────────────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(var(--foreground))',
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
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={abbr} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <ReTooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(val: number | undefined, name: string | undefined) => [fmt(val ?? 0), name ?? '']}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="Einnahmen" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} opacity={0.85} />
          <Bar dataKey="Ausgaben"  fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={32} opacity={0.85} />
          <Line dataKey="Netto" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ─── 2. Ausgaben nach Kategorien ───────────────────────────────────────────────
function CategoryChart({ summaries, locale }: { summaries: Summary[]; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

  const data = [...summaries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(m => ({
      label:          monthLabel(m.month, locale),
      Lebensmittel:   m.food,
      Freizeit:       m.leisure,
      Abos:           m.subscriptions,
      Taschengeld:    m.pocket_money,
      Sonstiges:      m.other_expenses,
    }))

  const cats = ['Lebensmittel', 'Freizeit', 'Abos', 'Taschengeld', 'Sonstiges'] as const

  return (
    <Card>
      <SectionTitle>Ausgaben nach Kategorie</SectionTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={abbr} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <ReTooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(val: number | undefined, name: string | undefined) => [fmt(val ?? 0), name ?? '']}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          />
          {cats.map(cat => (
            <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[cat]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ─── 3. Monatliche Abweichung + Extremereignisse ───────────────────────────────
function DeviationTable({ summaries, locale }: { summaries: Summary[]; locale: string }) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

  const sorted = [...summaries].sort((a, b) => b.month.localeCompare(a.month))

  const { avg, stddev } = useMemo(() => {
    if (sorted.length === 0) return { avg: 0, stddev: 0 }
    const a = sorted.reduce((s, m) => s + netBal(m), 0) / sorted.length
    const sd = Math.sqrt(sorted.reduce((s, m) => s + (netBal(m) - a) ** 2, 0) / sorted.length)
    return { avg: a, stddev: sd }
  }, [sorted])

  const extremeThreshold = Math.max(stddev * 1.5, Math.abs(avg) * 0.3)

  return (
    <Card>
      <SectionTitle>Monatliche Abweichung · Ø {fmt(avg)}/Monat</SectionTitle>
      <div className="space-y-1.5">
        {sorted.map(m => {
          const nb         = netBal(m)
          const dev        = nb - avg
          const devPct     = avg !== 0 ? (dev / Math.abs(avg)) * 100 : 0
          const isExtreme  = Math.abs(dev) > extremeThreshold
          const isPositive = nb >= 0
          const isGoodMonth = dev > extremeThreshold
          const isBadMonth  = dev < -extremeThreshold

          return (
            <div
              key={m.month}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm
                ${isBadMonth  ? 'bg-red-50    dark:bg-red-950/20    border border-red-200   dark:border-red-900/40' :
                  isGoodMonth ? 'bg-green-50  dark:bg-green-950/20  border border-green-200 dark:border-green-900/40' :
                                'bg-muted/20 border border-transparent'}`}
            >
              {/* Extreme icon */}
              <div className="w-4 shrink-0">
                {isBadMonth  ? <AlertTriangle className="size-3.5 text-red-500"   /> :
                 isGoodMonth ? <TrendingUp    className="size-3.5 text-green-500" /> :
                               <Minus className="size-3 text-muted-foreground/30" />}
              </div>

              {/* Month */}
              <span className="w-16 shrink-0 text-xs font-medium">
                {monthLabel(m.month, locale)}
              </span>

              {/* Income / Expense */}
              <span className="flex-1 text-xs text-muted-foreground hidden sm:block">
                <span className="text-green-600 dark:text-green-400">{fmt(m.total_income)}</span>
                {' / '}
                <span className="text-red-600 dark:text-red-400">{fmt(m.total_expenses)}</span>
              </span>

              {/* Net balance */}
              <span className={`w-24 text-right text-xs font-semibold tabular-nums shrink-0
                ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '+' : ''}{fmt(nb)}
              </span>

              {/* Deviation */}
              <span className={`w-16 text-right text-xs tabular-nums shrink-0
                ${dev > 0 ? 'text-green-600 dark:text-green-400' :
                  dev < 0 ? 'text-red-500'   : 'text-muted-foreground'}`}>
                {dev > 0 ? '+' : ''}{devPct.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
      {extremeThreshold > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Extremereignis = Abweichung &gt; {fmt(extremeThreshold)} vom Durchschnitt
        </p>
      )}
    </Card>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function FinanceAnalytics({ summaries, locale }: Props) {
  if (summaries.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">
        Finanzanalyse
        <span className="ml-2 text-xs font-normal text-muted-foreground">letzte {summaries.length} Monate</span>
      </h2>

      {/* Row 1: Income/Expense + Categories */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncomeExpenseChart summaries={summaries} locale={locale} />
        <CategoryChart      summaries={summaries} locale={locale} />
      </div>

      {/* Row 2: Deviation table */}
      <DeviationTable summaries={summaries} locale={locale} />
    </div>
  )
}
