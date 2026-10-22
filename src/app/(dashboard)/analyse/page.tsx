import { getAuthUser } from '@/lib/supabase/server'
import type {
  HeatmapDay, SankeyData, SankeyNodeDatum, SankeyLinkDatum,
  CashflowEvent, MonthlyComparison, CategoryDatum, MonthSeries, MonthTotals,
} from '@/lib/analyseData'
import { AnalysePeriodSelector }  from '@/components/analyse/AnalysePeriodSelector'
import { AnalyseAccountSelector } from '@/components/analyse/AnalyseAccountSelector'
import { AusgabenHeatmap, type Mode as HeatmapMode } from '@/components/analyse/AusgabenHeatmap'
import { GeldflussChart }        from '@/components/analyse/GeldflussChart'
import { CashflowKalender }      from '@/components/analyse/CashflowKalender'
import { MonatsVergleich }       from '@/components/analyse/MonatsVergleich'
import { KategorienChart }       from '@/components/analyse/KategorienChart'
import { MonatsVerteilung }      from '@/components/analyse/MonatsVerteilung'
import { FlowKindToggle }        from '@/components/finance/flow-kind-toggle'
import { getSettings }          from '@/lib/settings'
import { getActiveAccountOptions } from '@/lib/data/overview'
import { getFlowTransactions, getMonthlyFlows, txToFlowRow, type FlowTransaction } from '@/lib/data/flows'
import {
  INCLUDE_ALL, includeFromParam, monthlySeries, rollupByRoot, UNCATEGORIZED,
  type FlowInclude, type MonthSummary,
} from '@/lib/finance/flow-calc'
import { monthsForPeriod, parsePeriod, periodCutoff, ymd } from '@/lib/period'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'

const HEATMAP_MODES: HeatmapMode[] = ['ausgaben', 'einnahmen', 'guv']

/**
 * Alle Zahlen dieser Seite kommen aus `lib/data/flows` (Views monthly_flows und
 * unified_transactions, Migration 20261021). Was als Einnahme/Ausgabe zählt, entscheidet die
 * Datenbank; die Seite wählt nur, ob Anlagen und Forderungen mitgerechnet werden (Schalter,
 * URL-Parameter `anlage`). Umbuchungen zwischen eigenen Konten fehlen immer.
 *
 * Früher gab es zwei Pfade: ohne Konten-Filter die Cron-Tabelle monthly_finance_summary, mit
 * Filter eine Aggregation im Server. Beide Pfade lieferten für denselben Monat nicht immer
 * dieselbe Zahl. Jetzt gibt es einen Pfad, die Konten sind eine Dimension der View.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

const rootName = (t: FlowTransaction) => t.root_category_name ?? t.category_name ?? UNCATEGORIZED
const monthKey = (month: string) => month.slice(0, 7)
const monthLabel = (month: string) =>
  new Date(month.slice(0, 10) + 'T12:00:00').toLocaleDateString('de-DE', { month: 'short' })

// ── Data builders ──────────────────────────────────────────────────────────────

function buildHeatmap(txns: FlowTransaction[]): HeatmapDay[] {
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
function buildCategories(txns: FlowTransaction[]): CategoryDatum[] {
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

function buildSankey(txns: FlowTransaction[]): SankeyData {
  const incMap = new Map<string, number>()
  const expMap = new Map<string, number>()
  for (const t of txns) {
    const name = rootName(t)
    if (t.type === 'income') incMap.set(name, (incMap.get(name) ?? 0) + t.amount)
    else expMap.set(name, (expMap.get(name) ?? 0) + t.amount)
  }

  const totalIncome   = [...incMap.values()].reduce((s, v) => s + v, 0)
  const totalExpenses = [...expMap.values()].reduce((s, v) => s + v, 0)
  if (totalIncome === 0 && totalExpenses === 0) return { nodes: [], links: [] }

  const topInc = [...incMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topExp = [...expMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)

  // Balance gegen die Summe der TATSÄCHLICH gezeigten Top-Kategorien, nicht gegen
  // totalIncome/totalExpenses: gibt es mehr als 5 Einnahme- bzw. 7 Ausgabenkategorien,
  // fehlt der Rest im Diagramm, aber die vollen Summen zählten ihn trotzdem mit. Der
  // "Einnahmen"-Knoten bekam dadurch weniger eingehenden Wert (nur die Top 5), als die
  // abgehenden Bänder (skaliert auf die volle totalIncome) beanspruchten — das Sankey-
  // Layout ging nicht auf, sichtbar als Balken, an dem die Ausgaben-Bänder nicht bis zum
  // Rand reichen.
  const topIncSum = topInc.reduce((s, [, v]) => s + v, 0)
  const topExpSum = topExp.reduce((s, [, v]) => s + v, 0)

  const surplus = Math.max(0, topIncSum - topExpSum)
  // Scale expense outflow to balance with income inflow
  const expOutflow = Math.min(topIncSum, topExpSum)
  const expScale   = topExpSum > 0 ? expOutflow / topExpSum : 0

  const einnahmenIdx = topInc.length
  const expOffset    = topInc.length + 1
  const surplusIdx   = expOffset + topExp.length

  const nodes: SankeyNodeDatum[] = [
    ...topInc.map(([name]) => ({ name })),
    { name: 'Einnahmen' },
    ...topExp.map(([name]) => ({ name })),
    ...(surplus > 50 ? [{ name: 'Überschuss' }] : []),
  ]

  // `value` steuert die Bandbreite, `realValue` den Tooltip. Die beiden fallen bei den
  // Ausgaben auseinander: sind die Ausgaben größer als die Einnahmen, werden die abgehenden
  // Bänder heruntergerechnet (expScale), damit das Sankey-Layout aufgeht. Ohne getrennten
  // realValue zeigte der Tooltip genau diesen gestauchten Wert an — in einem Monat mit mehr
  // Ausgaben als Einnahmen also durchweg zu wenig.
  const links: SankeyLinkDatum[] = [
    // income cats → Einnahmen
    ...topInc.map(([, v], i) => ({
      source: i, target: einnahmenIdx,
      value: Math.max(1, Math.round(v)), realValue: Math.round(v),
    })),
    // Einnahmen → expense cats (scaled to balance)
    ...topExp.map(([, v], i) => ({
      source: einnahmenIdx, target: expOffset + i,
      value: Math.max(1, Math.round(v * expScale)), realValue: Math.round(v),
    })),
    // Einnahmen → Überschuss
    ...(surplus > 50
      ? [{ source: einnahmenIdx, target: surplusIdx, value: Math.round(surplus), realValue: Math.round(surplus) }]
      : []),
  ]

  return { nodes, links: links.filter(l => l.value > 0) }
}

function buildCashflow(txns: FlowTransaction[], include: FlowInclude): CashflowEvent[] {
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
function buildMonthlyComparison(
  series: MonthSummary[], currentMonthKey: string, monthsToShow: number,
): MonthlyComparison[] {
  // `<` statt `!==`: ein Monat in der Zukunft (vordatierte manuelle Buchung) ist nicht abgeschlossen.
  const done = series.filter(m => monthKey(m.month) < currentMonthKey).slice(-monthsToShow)
  const current = series.find(m => monthKey(m.month) === currentMonthKey)
  return [
    ...done.map(m => ({
      month: monthLabel(m.month),
      einnahmen: Math.round(m.income),
      ausgaben: Math.round(m.expense),
      sparquote: m.savingsRate,
    })),
    ...(current ? [{
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
function buildMonthSeries(series: MonthSummary[], currentMonthKey: string): MonthSeries {
  const months = series.filter(m => monthKey(m.month) < currentMonthKey).slice(-24)
  return {
    ausgaben:  months.map(m => Math.round(m.expense)),
    einnahmen: months.map(m => Math.round(m.income)),
    guv:       months.map(m => Math.round(m.net)),
  }
}

// `null` bei einem Monat ohne jede Buchung: ein Monat ohne Daten ist kein Monat mit
// Nullausgaben, und die Karte würde den Marker sonst an den linken Rand setzen.
function currentMonthTotals(series: MonthSummary[], currentMonthKey: string): MonthTotals | null {
  const m = series.find(s => monthKey(s.month) === currentMonthKey)
  if (!m) return null
  return { einnahmen: Math.round(m.income), ausgaben: Math.round(m.expense), guv: Math.round(m.net) }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; accounts?: string; anlage?: string }>
}) {
  const [{ period: rawPeriod, accounts: rawAccounts, anlage: rawAnlage }, { supabase, user }] =
    await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  const [accounts, settings] = await Promise.all([
    getActiveAccountOptions(supabase, user.id),
    getSettings(user.id),
  ])

  const accountIds = new Set(accounts.map(a => a.id))

  // Zeitraum: explicit URL param wins, else the saved Settings-Standard, else '1J'.
  const period = parsePeriod(rawPeriod, parsePeriod(settings.analyse_default_period))

  // Heatmap-Ansicht: same fallback shape, just seeds the client component's initial state
  // (nothing to persist in the URL for this one).
  const defaultHeatmapMode = HEATMAP_MODES.includes(settings.analyse_default_heatmap_mode as HeatmapMode)
    ? (settings.analyse_default_heatmap_mode as HeatmapMode)
    : 'ausgaben'

  // Der Cutoff kommt aus lib/period statt aus einer eigenen Rechnung. `null` heißt
  // ausdrücklich: nicht nach Datum filtern („Alles").
  const cutoff = periodCutoff(period)
  const include: FlowInclude = includeFromParam(rawAnlage)

  // Kalender: die GESAMTE Historie bis Ende des nächsten Monats. Früher stand hier ein 3-Monats-Fenster, obwohl man im
  // Kalender beliebig weit zurückblättern konnte: ältere Monate waren leer, als gäbe es dort keine Buchungen.
  const now = new Date()
  const calEnd   = ymd(new Date(now.getFullYear(), now.getMonth() + 2, 0))
  // Trailing 24-month window für Monatsvergleich und KDE-Verteilung, unabhängig von `period`:
  // die Verteilung braucht bis zu 24 abgeschlossene Monate. monthsForPeriod schneidet den
  // Überschuss beim Anzeigen ab.
  const monthlyCutoff = ymd(new Date(now.getFullYear(), now.getMonth() - 24, 1))
  const currentMonthKey = ymd(now).slice(0, 7)

  // Konten-Filter: 'all' is an explicit "Alle Konten" click (see AnalyseAccountSelector) and
  // always wins. No `accounts` param at all means the page was reached without ever touching
  // this filter, so the saved Settings-Standardauswahl applies. A concrete id list is an
  // explicit filter and also wins over the default.
  const defaultAccountIds = Array.isArray(settings.analyse_default_accounts)
    ? (settings.analyse_default_accounts as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  let selectedAccountIds: string[]
  if (rawAccounts === undefined) {
    selectedAccountIds = defaultAccountIds.filter(id => accountIds.has(id))
  } else if (rawAccounts === 'all' || rawAccounts === '') {
    selectedAccountIds = []
  } else {
    selectedAccountIds = rawAccounts
      .split(',')
      .map(s => s.trim())
      .filter(id => accountIds.has(id))
  }
  const accountFilter = selectedAccountIds.length > 0 ? selectedAccountIds : undefined

  const [txns, calTxns, monthlyRows] = await Promise.all([
    // Buchungen im Zeitraum (Heatmap, Kategorien, Sankey)
    getFlowTransactions(supabase, user.id, { from: cutoff, accountIds: accountFilter, include }),
    // Kalender: alles, unabhängig vom Zeitraum und vom Schalter (Anlage/Forderung kommen mit, sind aber grau markiert,
    // wenn der Schalter sie ausblendet)
    getFlowTransactions(supabase, user.id, { to: calEnd, accountIds: accountFilter, include: INCLUDE_ALL }),
    // Monatssummen (Monatsvergleich + Verteilung), mit und ohne Konten-Filter aus derselben View
    getMonthlyFlows(supabase, user.id, { from: monthlyCutoff, accountIds: accountFilter, include }),
  ])

  const series = monthlySeries(monthlyRows, include)
  const thisMonth = currentMonthTotals(series, currentMonthKey)

  return (
    // Zeitraum- und Kontenwahl schreiben in die URL und lösen ein Server-Rendering aus.
    // Der Provider markiert den Klick sofort in der Leiste (optimistisch) und blendet
    // über <FilterPending> die Charts ab, solange die neuen Zahlen unterwegs sind.
    <UrlFiltersProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-3xl font-bold text-foreground">Analyse</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <FlowKindToggle />
            <AnalyseAccountSelector accounts={accounts} selected={selectedAccountIds} />
            <AnalysePeriodSelector current={period} />
          </div>
        </div>

        {include.anlage && (
          <p className="-mt-3 text-xs text-muted-foreground">
            Anlagen (Krypto, Depot, Bauspar) und Forderungen sind in Einnahmen und Ausgaben
            eingerechnet. Die Sparquote rechnet weiterhin ohne sie.
          </p>
        )}

        <FilterPending className="space-y-6">
          <div className="space-y-6">
            {/* Heatmap */}
            <AusgabenHeatmap data={buildHeatmap(txns)} initialMode={defaultHeatmapMode} />

            {/* Geldfluss + Cashflow-Kalender */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GeldflussChart data={buildSankey(txns)} />
              <CashflowKalender events={buildCashflow(calTxns, include)} />
            </div>

            {/* Monatlicher Vergleich + Kategorien */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MonatsVergleich data={buildMonthlyComparison(series, currentMonthKey, monthsForPeriod(period))} />
              <KategorienChart data={buildCategories(txns)} />
            </div>

            {/* Verteilung — eigene, kategorieunabhängige Sicht auf die Monatssummen,
                deshalb immer über den vollen 24-Monats-Horizont statt der
                `period`-Auswahl (der Konten-Filter greift dagegen schon). */}
            <MonatsVerteilung history={buildMonthSeries(series, currentMonthKey)} current={thisMonth} />
          </div>
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
