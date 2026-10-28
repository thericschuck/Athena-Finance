/**
 * Aggregiert die Zahlen für einen Report direkt aus den bestehenden Tabellen — kein LLM,
 * kein Athena-Werkzeugaufruf. Ein Report ist eine deterministische Rechnung über Zahlen,
 * die schon in der DB liegen, nicht eine Einschätzung; das hält ihn günstig, reproduzierbar
 * und frei von Bank-Freitext, der theoretisch Prompt-Injection tragen könnte (siehe
 * docs/athenas-takt.html, Abschnitt III).
 *
 * Einnahmen/Ausgaben kommen aus derselben Datenschicht wie Dashboard und Analyse
 * (lib/data/flows) und folgen demselben Standard wie Analyse und Dashboard
 * (`user_settings.flow_default_include`: alle, oder nur Konsum = `flow_kind = 'echt'`).
 * Umbuchungen zwischen eigenen Konten fehlen grundsätzlich. Das Nettovermögen kommt direkt aus `net_worth_snapshots.net_worth`,
 * derselben Kernzahl wie auf dem Dashboard (siehe Memory networth_definition).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getFlowTransactionsFuerNutzer, txToFlowRow } from '../data/flows.ts'
import { FLOW_DEFAULT_KEY, flowDefaultFrom, includeForDefault, rollupByRoot, sumFlows, type FlowInclude } from '../finance/flow-calc.ts'
import { ladeSteuerdaten } from '../tax/laden.ts'
import { berechneSteuerposition } from '../tax/position.ts'
import type {
  ReportData, ReportType, ReportTotals, ReportCategoryDatum, ReportCategoryChange,
  ReportNetWorth, ReportInsightRow, ReportTax,
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

/**
 * Welche Arten in den Report zählen: der Standard aus den Einstellungen (Analyse -> „Anlagen & Forderungen"), ohne Einstellung
 * alles. Gleiche Sicht wie Analyse und Dashboard, damit der Report dieselben Zahlen nennt.
 */
async function reportInclude(supabase: SupabaseClient<Database>, userId: string): Promise<FlowInclude> {
  const { data } = await supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', FLOW_DEFAULT_KEY).maybeSingle()
  return includeForDefault(flowDefaultFrom(data?.value))
}

async function periodTotals(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  include: FlowInclude,
): Promise<ReportTotals> {
  const txns = await getFlowTransactionsFuerNutzer(supabase, userId, { from: start, to: end, include })
  const t = sumFlows(txns.map(txToFlowRow), include)
  return { income: round2(t.income), expenses: round2(t.expense), net: round2(t.net) }
}

/** Ausgaben je Hauptkategorie, größte zuerst. */
async function categoryBreakdown(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  include: FlowInclude,
): Promise<ReportCategoryDatum[]> {
  const txns = await getFlowTransactionsFuerNutzer(supabase, userId, { from: start, to: end, include })
  return rollupByRoot(txns.map(txToFlowRow), include, 'expense')
    .map(c => ({ name: c.name, amount: round2(c.expense) }))
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

/**
 * Steuer-Anhang eines Jahres aus derselben Rechnung wie die Steuer-Seite (ladeSteuerdaten +
 * berechneSteuerposition) — eine Umsetzung, keine zweite. Scheitert sie, steht der Grund im Report statt
 * einer Zahl aus halben Daten.
 */
async function buildTaxAppendix(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number,
): Promise<{ tax?: ReportTax; taxError?: string }> {
  try {
    const daten = await ladeSteuerdaten(supabase, userId, year)
    const p = berechneSteuerposition(daten.eingaben)
    return {
      tax: {
        year,
        profit: p.betrieb.gewinn,
        taxableIncome: p.zve.betrag,
        estimatedTax: p.steuer.gesamt,
        marginalRatePct: p.grenzsteuersatz.naechster_euro_pct,
        smallBusinessStatus: p.kleinunternehmer.status,
        reserveTarget: p.ruecklage.soll,
        reserveActual: p.ruecklage.ist,
        crypto: daten.krypto
          ? {
              taxableBalance: daten.krypto.ergebnis.saldoSteuerpflichtigEur,
              toTax: daten.krypto.ergebnis.zuVersteuernEur,
              taxFreeGain: daten.krypto.ergebnis.steuerfreierGewinnEur,
              allowance: daten.krypto.freigrenzeEur,
            }
          : null,
        warnings: [...p.warnungen, ...(daten.krypto?.warnungen ?? []), ...(daten.kryptoFehler ? [`Krypto nicht geladen: ${daten.kryptoFehler}`] : [])].slice(0, 8),
      },
    }
  } catch (err) {
    return { taxError: err instanceof Error ? err.message : 'Steuerposition nicht berechenbar.' }
  }
}

export async function buildReportData(
  supabase: SupabaseClient<Database>,
  userId: string,
  period: ReportPeriod,
  opts: { includeTax?: boolean } = {},
): Promise<ReportData> {
  const include = await reportInclude(supabase, userId)
  const [totals, previousTotals, categories, previousCategories, netWorth, openInsights] = await Promise.all([
    periodTotals(supabase, userId, period.periodStart, period.periodEnd, include),
    periodTotals(supabase, userId, period.previousPeriodStart, period.previousPeriodEnd, include),
    categoryBreakdown(supabase, userId, period.periodStart, period.periodEnd, include),
    categoryBreakdown(supabase, userId, period.previousPeriodStart, period.previousPeriodEnd, include),
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
    // Nur im Jahresreport und nur, wenn ausdrücklich gewünscht: der Report geht auch per Mail raus.
    ...(opts.includeTax && period.type === 'annual'
      ? await buildTaxAppendix(supabase, userId, Number(period.periodStart.slice(0, 4)))
      : {}),
    generatedAt:          new Date().toISOString(),
  }
}
