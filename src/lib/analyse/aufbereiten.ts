import type {
  HeatmapDay, SankeyData,
  CashflowEvent, MonthlyComparison, CategoryDatum, MonthSeries, MonthTotals,
} from '@/lib/analyseData'
import { baueGeldfluss } from '@/lib/analyse/geldfluss'
import { txToFlowRow, type FlowTransaction } from '@/lib/data/flows'
import {
  INCLUDE_ALL, rollupByRoot, UNCATEGORIZED,
  type FlowInclude, type MonthSummary,
} from '@/lib/finance/flow-calc'

/**
 * Aufbereitung der Analyse-Seite: aus Buchungen und Monatssummen die Formen, die die Charts
 * erwarten. Aus page.tsx herausgezogen, damit die Seite nur noch Daten holt und verteilt und
 * die Rechnungen einzeln testbar und von den Abschnitten wiederverwendbar sind.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

export const rootName = (t: FlowTransaction) => t.root_category_name ?? t.category_name ?? UNCATEGORIZED
export const monthKey = (month: string) => month.slice(0, 7)
export const monthLabel = (month: string) =>
  new Date(month.slice(0, 10) + 'T12:00:00').toLocaleDateString('de-DE', { month: 'short' })

// ── Data builders ──────────────────────────────────────────────────────────────

export function buildHeatmap(txns: FlowTransaction[]): HeatmapDay[] {
  const map = new Map<string, { amount: number; income: number }>()
  for (const t of txns) {
    const cur = map.get(t.date) ?? { amount: 0, income: 0 }
    map.set(t.date, t.type === 'expense'
      ? { ...cur, amount: cur.amount + t.amount }
      : { ...cur, income: cur.income + t.amount })
  }
  return [...map.entries()]
    .map(([date, { amount, income }]) => ({
      date, amount: Math.round(amount), income: Math.round(income),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Hauptkategorien mit den Unterkategorien darunter. Einnahmen und Ausgaben stehen als
 * getrennte Einträge (Einnahmen positiv, Ausgaben negativ): eine Hauptkategorie, in der beides
 * vorkommt, würde sich sonst gegeneinander aufheben.
 */
export function buildCategories(txns: FlowTransaction[]): CategoryDatum[] {
  const rows = txns.map(txToFlowRow)
  const side = (by: 'income' | 'expense', sign: 1 | -1): CategoryDatum[] =>
    rollupByRoot(rows, INCLUDE_ALL, by).map(root => ({
      name: root.name,
      value: Math.round(sign * root[by]),
      children: root.children
        .filter(c => c[by] !== 0)
        .map(c => ({ name: c.name, value: Math.round(sign * c[by]) })),
    })).filter(d => d.value !== 0)
  return [...side('income', 1), ...side('expense', -1)]
}

/**
 * Geldfluss für das Sankey und die Fluss-Liste. Die Rechnung liegt in `geldfluss.ts` (mit Tests):
 * Top-N plus Sammelknoten „Weitere", Anlagen als eigener Fluss, „Fehlbetrag" statt gestauchter
 * Bänder, `kategorieId` für den Drill-down. Signatur unverändert.
 */
export function buildSankey(txns: FlowTransaction[]): SankeyData {
  return baueGeldfluss(txns)
}

export function buildCashflow(txns: FlowTransaction[], include: FlowInclude): CashflowEvent[] {
  return txns.map(t => ({
    date:   t.date,
    type:   t.type,
    label:  t.category_name ?? t.description ?? t.merchant ?? 'Transaktion',
    amount: t.amount,
    kind:   t.flow_kind,
    // Wie die Charts: Anlage und Forderung zählen nur, wenn der Schalter oben sie einrechnet.
    zaehlt: t.flow_kind === 'echt' || (t.flow_kind === 'anlage' && include.anlage) || (t.flow_kind === 'forderung' && include.forderung),
  }))
}

/**
 * Monatsvergleich: abgeschlossene Monate plus — ausdrücklich unvollständig — der laufende.
 *
 * Der laufende Monat steht nicht in der Historie, weil er per Definition unvollständig ist
 * und die Verteilung künstlich nach unten ziehen würde (siehe buildMonthSeries).
 *
 * Die Sparquote kommt aus `savingsRate` (auf Konsum, nur `echt`) und ist `null` bei einem
 * Monat ohne Einnahmen: „0 %" würde eine ausgeglichene Bilanz behaupten, tatsächlich ist die
 * Quote dann nicht definiert. Negativ darf sie sein (mehr Ausgaben als Einnahmen).
 */
export function buildMonthlyComparison(
  series: MonthSummary[], currentMonthKey: string, monthsToShow: number,
): MonthlyComparison[] {
  // `<` statt `!==`: ein Monat in der Zukunft (vordatierte manuelle Buchung) ist nicht abgeschlossen.
  const done = series.filter(m => monthKey(m.month) < currentMonthKey).slice(-monthsToShow)
  const current = series.find(m => monthKey(m.month) === currentMonthKey)
  return [
    ...done.map(m => ({
      key: monthKey(m.month),
      month: monthLabel(m.month),
      einnahmen: Math.round(m.income),
      ausgaben: Math.round(m.expense),
      sparquote: m.savingsRate,
    })),
    ...(current ? [{
      key: monthKey(current.month),
      month: monthLabel(current.month),
      einnahmen: Math.round(current.income),
      ausgaben: Math.round(current.expense),
      sparquote: current.savingsRate,
      laufend: true,
    }] : []),
  ]
}

// Historie für die Verteilungs-Karte — bis zu 24 ABGESCHLOSSENE Monate. Alle drei Reihen
// kommen aus demselben Durchlauf, weil die Karte zwischen Ausgaben, Einnahmen und GuV
// umschaltbar ist — ein Umschalten soll keinen Server-Roundtrip kosten.
export function buildMonthSeries(series: MonthSummary[], currentMonthKey: string): MonthSeries {
  const months = series.filter(m => monthKey(m.month) < currentMonthKey).slice(-24)
  return {
    ausgaben:  months.map(m => Math.round(m.expense)),
    einnahmen: months.map(m => Math.round(m.income)),
    guv:       months.map(m => Math.round(m.net)),
  }
}

// `null` bei einem Monat ohne jede Buchung: ein Monat ohne Daten ist kein Monat mit
// Nullausgaben, und die Karte würde den Marker sonst an den linken Rand setzen.
export function currentMonthTotals(series: MonthSummary[], currentMonthKey: string): MonthTotals | null {
  const m = series.find(s => monthKey(s.month) === currentMonthKey)
  if (!m) return null
  return { einnahmen: Math.round(m.income), ausgaben: Math.round(m.expense), guv: Math.round(m.net) }
}

