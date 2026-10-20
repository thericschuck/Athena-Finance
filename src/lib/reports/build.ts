/**
 * Aggregiert die Zahlen für einen Report direkt aus den bestehenden Tabellen — kein LLM,
 * kein Athena-Werkzeugaufruf. Ein Report ist eine deterministische Rechnung über Zahlen,
 * die schon in der DB liegen, nicht eine Einschätzung; das hält ihn günstig, reproduzierbar
 * und frei von Bank-Freitext, der theoretisch Prompt-Injection tragen könnte (siehe
 * docs/athenas-takt.html, Abschnitt III).
 *
 * Einnahmen/Ausgaben werden ausschließlich aus `flow_kind = 'echt'` gebildet — Anlagen,
 * Forderungen und Umbuchungen verzerren sonst die Cashflow-Zahl (siehe Memory
 * flow_kind_regel). Das Nettovermögen kommt direkt aus `net_worth_snapshots.net_worth`,
 * derselben Kernzahl wie auf dem Dashboard (siehe Memory networth_definition).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type {
  ReportData, ReportType, ReportTotals, ReportCategoryDatum, ReportCategoryChange,
  ReportNetWorth, ReportInsightRow,
} from './types'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export type ReportPeriod = {
  type:                 ReportType
  periodStart:          string
  periodEnd:            string
  label:                string
  previousPeriodStart:  string
  previousPeriodEnd:    string
  previousLabel:        string
}

/** Kalendermonat `month` (1-12) in `year`, plus der direkt vorangehende Monat als Vergleich. */
export function monthPeriod(year: number, month: number): ReportPeriod {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`monthPeriod: ungültiger Monat ${year}-${month} (Monat muss 1-12 sein)`)
  }
  const start     = new Date(Date.UTC(year, month - 1, 1))
  const end       = new Date(Date.UTC(year, month, 0))
  const prevStart = new Date(Date.UTC(year, month - 2, 1))
  const prevEnd   = new Date(Date.UTC(year, month - 1, 0))
  return {
    type:                'monthly',
    periodStart:         isoDate(start),
    periodEnd:           isoDate(end),
    label:               `${MONTH_NAMES[month - 1]} ${year}`,
    previousPeriodStart: isoDate(prevStart),
    previousPeriodEnd:   isoDate(prevEnd),
    previousLabel:       `${MONTH_NAMES[prevStart.getUTCMonth()]} ${prevStart.getUTCFullYear()}`,
  }
}

/** Kalenderjahr `year`, plus das Vorjahr als Vergleich. */
export function yearPeriod(year: number): ReportPeriod {
  return {
    type:                'annual',
    periodStart:         `${year}-01-01`,
    periodEnd:           `${year}-12-31`,
    label:               `${year}`,
    previousPeriodStart: `${year - 1}-01-01`,
    previousPeriodEnd:   `${year - 1}-12-31`,
    previousLabel:       `${year - 1}`,
  }
}

async function periodTotals(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
): Promise<ReportTotals> {
  const { data } = await supabase
    .from('unified_transactions')
    .select('type, amount, amount_base')
    .eq('user_id', userId)
    .eq('flow_kind', 'echt')
    .gte('date', start)
    .lte('date', end)

  let income = 0
  let expenses = 0
  for (const row of (data ?? []) as { type: string; amount: number; amount_base: number | null }[]) {
    const eur = Math.abs(row.amount_base ?? row.amount)
    if (row.type === 'income') income += eur
    else if (row.type === 'expense') expenses += eur
  }
  return { income: round2(income), expenses: round2(expenses), net: round2(income - expenses) }
}

async function categoryBreakdown(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
): Promise<ReportCategoryDatum[]> {
  const { data } = await supabase
    .from('unified_transactions')
    .select('category_name, amount, amount_base')
    .eq('user_id', userId)
    .eq('flow_kind', 'echt')
    .eq('type', 'expense')
    .gte('date', start)
    .lte('date', end)

  const map = new Map<string, number>()
  for (const row of (data ?? []) as { category_name: string | null; amount: number; amount_base: number | null }[]) {
    const name = row.category_name ?? 'Ohne Kategorie'
    const eur  = Math.abs(row.amount_base ?? row.amount)
    map.set(name, (map.get(name) ?? 0) + eur)
  }
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
}

/** Nur Kategorien, die sich gegenüber der Vorperiode um mindestens 30 EUR UND 25% verändert
 *  haben — sonst würde jede kleine Schwankung als „auffällig" gemeldet. */
function notableChanges(
  current: ReportCategoryDatum[],
  previous: ReportCategoryDatum[],
): ReportCategoryChange[] {
  const prevMap = new Map(previous.map(c => [c.name, c.amount]))
  return current
    .map(c => {
      const previousAmount = prevMap.get(c.name) ?? 0
      return { name: c.name, amount: c.amount, previousAmount, delta: round2(c.amount - previousAmount) }
    })
    .filter(c => Math.abs(c.delta) >= 30 && (c.previousAmount === 0 || Math.abs(c.delta / c.previousAmount) >= 0.25))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
}

async function netWorthDelta(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
): Promise<ReportNetWorth> {
  const [{ data: endRow }, { data: startRow }] = await Promise.all([
    supabase
      .from('net_worth_snapshots')
      .select('net_worth')
      .eq('user_id', userId)
      .lte('snapshot_date', end)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Letzter Snapshot VOR Periodenbeginn = Eröffnungsstand der Periode.
    supabase
      .from('net_worth_snapshots')
      .select('net_worth')
      .eq('user_id', userId)
      .lt('snapshot_date', start)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const endVal   = endRow?.net_worth   != null ? Number(endRow.net_worth)   : null
  const startVal = startRow?.net_worth != null ? Number(startRow.net_worth) : null
  return {
    start: startVal,
    end:   endVal,
    delta: startVal != null && endVal != null ? round2(endVal - startVal) : null,
  }
}

async function openInsightsList(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReportInsightRow[]> {
  const { data } = await supabase
    .from('insights')
    .select('title, severity, created_at')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(10)
  return ((data ?? []) as { title: string; severity: string; created_at: string }[])
    .map(r => ({ title: r.title, severity: r.severity, createdAt: r.created_at }))
}

export async function buildReportData(
  supabase: SupabaseClient<Database>,
  userId: string,
  period: ReportPeriod,
): Promise<ReportData> {
  const [totals, previousTotals, categories, previousCategories, netWorth, openInsights] = await Promise.all([
    periodTotals(supabase, userId, period.periodStart, period.periodEnd),
    periodTotals(supabase, userId, period.previousPeriodStart, period.previousPeriodEnd),
    categoryBreakdown(supabase, userId, period.periodStart, period.periodEnd),
    categoryBreakdown(supabase, userId, period.previousPeriodStart, period.previousPeriodEnd),
    netWorthDelta(supabase, userId, period.periodStart, period.periodEnd),
    openInsightsList(supabase, userId),
  ])

  return {
    type:                 period.type,
    periodStart:          period.periodStart,
    periodEnd:            period.periodEnd,
    label:                period.label,
    previousLabel:        period.previousLabel,
    totals,
    previousTotals,
    topExpenseCategories: categories.slice(0, 5),
    notableChanges:       notableChanges(categories, previousCategories),
    netWorth,
    openInsights,
    generatedAt:          new Date().toISOString(),
  }
}
