import { createClient } from '@/lib/supabase/server'
import type {
  HeatmapDay, SankeyData, SankeyNodeDatum, SankeyLinkDatum,
  CashflowEvent, MonthlyComparison, CategoryDatum,
} from '@/lib/analyseData'
import { AnalysePeriodSelector } from '@/components/analyse/AnalysePeriodSelector'
import { AusgabenHeatmap }       from '@/components/analyse/AusgabenHeatmap'
import { GeldflussChart }        from '@/components/analyse/GeldflussChart'
import { CashflowKalender }      from '@/components/analyse/CashflowKalender'
import { MonatsVergleich }       from '@/components/analyse/MonatsVergleich'
import { KategorienChart }       from '@/components/analyse/KategorienChart'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = '1M' | '3M' | '6M' | '1J' | 'Alles'
const VALID: Period[] = ['1M', '3M', '6M', '1J', 'Alles']

type TxnRow = {
  date:        string
  type:        string
  amount:      number
  amount_base: number | null
  category:    { name: string } | null
  description: string | null
  merchant:    string | null
}

type MonthlySummaryRow = {
  month:          string
  total_income:   number
  total_expenses: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCutoff(period: Period): string {
  const d = new Date()
  if (period === '1M') d.setMonth(d.getMonth() - 1)
  else if (period === '3M') d.setMonth(d.getMonth() - 3)
  else if (period === '6M') d.setMonth(d.getMonth() - 6)
  else if (period === '1J') d.setFullYear(d.getFullYear() - 1)
  else return '2000-01-01'
  return d.toISOString().split('T')[0]
}

function toEur(txn: Pick<TxnRow, 'amount' | 'amount_base'>): number {
  return Math.abs(txn.amount_base ?? txn.amount)
}

// ── Data builders ──────────────────────────────────────────────────────────────

function buildHeatmap(txns: TxnRow[]): HeatmapDay[] {
  const map = new Map<string, { amount: number; income: number }>()
  for (const t of txns) {
    const date = t.date.slice(0, 10)
    const eur  = toEur(t)
    const cur  = map.get(date) ?? { amount: 0, income: 0 }
    map.set(date, t.type === 'expense'
      ? { ...cur, amount: cur.amount + eur }
      : { ...cur, income: cur.income + eur })
  }
  return [...map.entries()]
    .map(([date, { amount, income }]) => ({
      date, amount: Math.round(amount), income: Math.round(income),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function buildCategories(txns: TxnRow[]): CategoryDatum[] {
  const map = new Map<string, number>()
  for (const t of txns) {
    const name = t.category?.name ?? 'Sonstiges'
    const eur  = toEur(t)
    const sign = t.type === 'income' ? 1 : -1
    map.set(name, (map.get(name) ?? 0) + sign * eur)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .filter(d => d.value !== 0)
    .sort((a, b) => b.value - a.value)
}

function buildSankey(txns: TxnRow[]): SankeyData {
  const incMap = new Map<string, number>()
  const expMap = new Map<string, number>()
  for (const t of txns) {
    const name = t.category?.name ?? 'Sonstiges'
    const eur  = toEur(t)
    if (t.type === 'income') incMap.set(name, (incMap.get(name) ?? 0) + eur)
    else expMap.set(name, (expMap.get(name) ?? 0) + eur)
  }

  const totalIncome   = [...incMap.values()].reduce((s, v) => s + v, 0)
  const totalExpenses = [...expMap.values()].reduce((s, v) => s + v, 0)
  if (totalIncome === 0 && totalExpenses === 0) return { nodes: [], links: [] }

  const surplus = Math.max(0, totalIncome - totalExpenses)
  // Scale expense outflow to balance with income inflow
  const expOutflow = Math.min(totalIncome, totalExpenses)
  const expScale   = totalExpenses > 0 ? expOutflow / totalExpenses : 0

  const topInc = [...incMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topExp = [...expMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)

  const einnahmenIdx = topInc.length
  const expOffset    = topInc.length + 1
  const surplusIdx   = expOffset + topExp.length

  const nodes: SankeyNodeDatum[] = [
    ...topInc.map(([name]) => ({ name })),
    { name: 'Einnahmen' },
    ...topExp.map(([name]) => ({ name })),
    ...(surplus > 50 ? [{ name: 'Überschuss' }] : []),
  ]

  const links: SankeyLinkDatum[] = [
    // income cats → Einnahmen
    ...topInc.map(([, v], i) => ({
      source: i, target: einnahmenIdx, value: Math.max(1, Math.round(v)),
    })),
    // Einnahmen → expense cats (scaled to balance)
    ...topExp.map(([, v], i) => ({
      source: einnahmenIdx, target: expOffset + i,
      value: Math.max(1, Math.round(v * expScale)),
    })),
    // Einnahmen → Überschuss
    ...(surplus > 50 ? [{ source: einnahmenIdx, target: surplusIdx, value: Math.round(surplus) }] : []),
  ]

  return { nodes, links: links.filter(l => l.value > 0) }
}

function buildCashflow(txns: TxnRow[]): CashflowEvent[] {
  return txns
    .filter(t => t.type === 'income' || t.type === 'expense')
    .map(t => ({
      date:   t.date.slice(0, 10),
      type:   t.type as 'income' | 'expense',
      label:  t.category?.name ?? t.description ?? t.merchant ?? 'Transaktion',
      amount: Math.abs(t.amount),
    }))
}

function buildMonthlyComparison(rows: MonthlySummaryRow[]): MonthlyComparison[] {
  return [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(r => {
      const dateStr = r.month.length <= 7 ? r.month + '-01' : r.month.slice(0, 10)
      const month   = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { month: 'short' })
      const sparquote = r.total_income > 0
        ? Math.round(((r.total_income - r.total_expenses) / r.total_income) * 100)
        : 0
      return {
        month,
        einnahmen: Math.round(r.total_income),
        ausgaben:  Math.round(r.total_expenses),
        sparquote: Math.max(0, sparquote),
      }
    })
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: rawPeriod } = await searchParams
  const period: Period = VALID.includes(rawPeriod as Period) ? (rawPeriod as Period) : '1J'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cutoff = getCutoff(period)

  // Current + adjacent months for calendar (3-month window so user can navigate)
  const now = new Date()
  const calStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const calEnd   = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0]

  const [txnRes, calRes, monthlyRes] = await Promise.all([
    // Transactions for period (heatmap, categories, sankey)
    supabase
      .from('transactions')
      .select('date, type, amount, amount_base, category:categories(name), description, merchant')
      .eq('user_id', user.id)
      .gte('date', cutoff)
      .in('type', ['income', 'expense'])
      .order('date'),

    // Transactions for calendar (3-month window, independent of period)
    supabase
      .from('transactions')
      .select('date, type, amount, category:categories(name), description, merchant')
      .eq('user_id', user.id)
      .gte('date', calStart)
      .lte('date', calEnd)
      .in('type', ['income', 'expense'])
      .order('date'),

    // Monthly summaries for MonatsVergleich
    supabase
      .from('monthly_finance_summary')
      .select('month, total_income, total_expenses')
      .order('month', { ascending: false })
      .limit(6),
  ])

  const txns    = (txnRes.data  ?? []) as TxnRow[]
  const calTxns = (calRes.data  ?? []) as TxnRow[]
  const monthly = (monthlyRes.data ?? []) as MonthlySummaryRow[]

  const heatmapData      = buildHeatmap(txns)
  const categoryData     = buildCategories(txns)
  const sankeyData       = buildSankey(txns)
  const cashflowEvents   = buildCashflow(calTxns)
  const monthlyComparison = buildMonthlyComparison(monthly)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-foreground">Analyse</h1>
        <AnalysePeriodSelector current={period} />
      </div>

      {/* Heatmap */}
      <AusgabenHeatmap data={heatmapData} />

      {/* Geldfluss + Cashflow-Kalender */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GeldflussChart data={sankeyData} />
        <CashflowKalender events={cashflowEvents} />
      </div>

      {/* Monatlicher Vergleich + Kategorien */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MonatsVergleich data={monthlyComparison} />
        <KategorienChart data={categoryData} />
      </div>
    </div>
  )
}
