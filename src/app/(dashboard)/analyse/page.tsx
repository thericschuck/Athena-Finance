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
import { getSettings }          from '@/lib/settings'
import { periodCutoff }         from '@/lib/period'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'

const HEATMAP_MODES: HeatmapMode[] = ['ausgaben', 'einnahmen', 'guv']

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = '1M' | '3M' | '6M' | '1J' | 'Alles'
const VALID: Period[] = ['1M', '3M', '6M', '1J', 'Alles']

// Row shape of the `unified_transactions` view (see migrations 20260821010000/020000) —
// merges the manual `transactions` ledger with FinTS-synced `bank_transactions` for any
// account linked via accounts.bank_iban.
type TxnRow = {
  date:          string
  type:          string
  amount:        number
  amount_base:   number | null
  category_name: string | null
  description:   string | null
  merchant:      string | null
}

type MonthlySummaryRow = {
  month:          string
  total_income:   number
  total_expenses: number
}

type AccountRow = {
  id:    string
  name:  string
  type:  string
  color: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    const name = t.category_name ?? 'Sonstiges'
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
    const name = t.category_name ?? 'Sonstiges'
    const eur  = toEur(t)
    if (t.type === 'income') incMap.set(name, (incMap.get(name) ?? 0) + eur)
    else expMap.set(name, (expMap.get(name) ?? 0) + eur)
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

function buildCashflow(txns: TxnRow[]): CashflowEvent[] {
  return txns
    .filter(t => t.type === 'income' || t.type === 'expense')
    .map(t => ({
      date:   t.date.slice(0, 10),
      type:   t.type as 'income' | 'expense',
      label:  t.category_name ?? t.description ?? t.merchant ?? 'Transaktion',
      amount: Math.abs(t.amount),
    }))
}

// `monthly_finance_summary` is a whole-user cron aggregate with no account_id column, so it
// can't be scoped to a Konten-Auswahl. When a filter is active we instead derive the same
// income/expense/sparquote shape directly from the (account-filtered) transactions.
function buildMonthlyComparisonFromTxns(
  txns: Pick<TxnRow, 'date' | 'type' | 'amount' | 'amount_base'>[],
  currentMonthKey: string,
): MonthlyComparison[] {
  const map = new Map<string, { income: number; expenses: number }>()
  for (const t of txns) {
    if (t.type !== 'income' && t.type !== 'expense') continue
    const month = t.date.slice(0, 7)
    const cur = map.get(month) ?? { income: 0, expenses: 0 }
    const eur = toEur(t)
    if (t.type === 'income') cur.income += eur
    else cur.expenses += eur
    map.set(month, cur)
  }
  const rows: MonthlySummaryRow[] = [...map.entries()].map(([month, v]) => ({
    month, total_income: v.income, total_expenses: v.expenses,
  }))
  return buildMonthlyComparison(rows, currentMonthKey)
}

// Historie für die Verteilungs-Karte — bis zu 24 ABGESCHLOSSENE Monate, der
// laufende Monat (currentMonthKey) fliegt bewusst raus: er ist per Definition
// unvollständig und würde die Verteilung künstlich nach unten ziehen. Er wird
// stattdessen separat als Vergleichswert (currentMonthTotals) gegen genau diese
// Historie getestet (siehe computePercentileRank).
//
// Alle drei Reihen kommen aus demselben Durchlauf, weil die Karte zwischen
// Ausgaben, Einnahmen und GuV umschaltbar ist — ein Umschalten soll keinen
// Server-Roundtrip kosten.
function buildMonthSeries(rows: MonthlySummaryRow[], currentMonthKey: string): MonthSeries {
  const months = rows
    .filter(r => r.month.slice(0, 7) !== currentMonthKey)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-24)
  return {
    ausgaben:  months.map(r => Math.round(r.total_expenses)),
    einnahmen: months.map(r => Math.round(r.total_income)),
    guv:       months.map(r => Math.round(r.total_income - r.total_expenses)),
  }
}

// Gleiches Prinzip wie buildMonthlyComparisonFromTxns oben — monthly_finance_summary
// hat keine account_id, bei aktivem Konten-Filter wird stattdessen direkt aus den
// (bereits kontogefilterten) Transaktionen aggregiert.
//
// Ein Monat mit Einnahmen aber ohne Ausgaben zählt hier als 0 in der
// Ausgabenreihe. Die frühere, rein ausgabenbasierte Variante hat ihn
// stillschweigend übersprungen — der Summary-Pfad oben liefert für denselben
// Monat aber eine Zeile mit total_expenses = 0. Beide Pfade sagen jetzt
// dasselbe.
function buildMonthSeriesFromTxns(
  txns: Pick<TxnRow, 'date' | 'type' | 'amount' | 'amount_base'>[],
  currentMonthKey: string,
): MonthSeries {
  const map = new Map<string, { income: number; expenses: number }>()
  for (const t of txns) {
    if (t.type !== 'income' && t.type !== 'expense') continue
    const month = t.date.slice(0, 7)
    if (month === currentMonthKey) continue
    const cur = map.get(month) ?? { income: 0, expenses: 0 }
    if (t.type === 'income') cur.income += toEur(t)
    else cur.expenses += toEur(t)
    map.set(month, cur)
  }
  const months = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([, v]) => v)
  return {
    ausgaben:  months.map(v => Math.round(v.expenses)),
    einnahmen: months.map(v => Math.round(v.income)),
    guv:       months.map(v => Math.round(v.income - v.expenses)),
  }
}

// Summen des laufenden Monats — aus `txns` (der ohnehin schon geladenen,
// periodengefilterten Transaktionsliste) statt einer eigenen Query: jeder
// Zeitraum (period) endet an "heute", der laufende Monat ist also immer
// Teilmenge von `txns`, unabhängig von der gewählten Periode.
//
// `null` bei einem Monat ohne jede Buchung. Die Vorgängerfunktion gab in dem
// Fall 0 zurück, was in der Karte als "dieser Monat: 0 €" ankam und den Marker
// an den linken Rand setzte — ein Monat ohne Daten ist aber kein Monat mit
// Nullausgaben.
function currentMonthTotals(txns: TxnRow[], currentMonthKey: string): MonthTotals | null {
  let einnahmen = 0
  let ausgaben  = 0
  let seen      = 0
  for (const t of txns) {
    if (t.date.slice(0, 7) !== currentMonthKey) continue
    if (t.type === 'income')       { einnahmen += toEur(t); seen++ }
    else if (t.type === 'expense') { ausgaben  += toEur(t); seen++ }
  }
  if (seen === 0) return null
  return {
    einnahmen: Math.round(einnahmen),
    ausgaben:  Math.round(ausgaben),
    guv:       Math.round(einnahmen - ausgaben),
  }
}

// Der laufende Monat fliegt raus — dieselbe Regel wie in buildMonthSeries, hier aber aus
// einem zweiten Grund: `monthly_finance_summary` wird per Cron geschrieben und hat die Zeile
// für den laufenden Monat noch nicht, der Transaktionspfad kennt sie sofort. Ohne den Filter
// zeigte dieselbe Karte je nach Konten-Auswahl unterschiedliche Monate — und am Monatsanfang
// eine Sparquote aus zwei Buchungen (1.9.: 80 € ein, 174 € aus, also −117 %), die den ganzen
// Achsenbereich verzogen hat.
function buildMonthlyComparison(
  rows: MonthlySummaryRow[],
  currentMonthKey: string,
): MonthlyComparison[] {
  return [...rows]
    .filter(r => r.month.slice(0, 7) !== currentMonthKey)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
    .map(r => {
      const dateStr = r.month.length <= 7 ? r.month + '-01' : r.month.slice(0, 10)
      const month   = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { month: 'short' })
      // Kein Math.max(0, …) mehr: ein Monat, in dem mehr rausging als reinkam, hat eine
      // NEGATIVE Sparquote. Auf 0 % gezogen sah der Dezember 2025 (881,50 € Einnahmen,
      // 3.874,60 € Ausgaben, also −339 %) aus wie eine schwarze Null. Die Achse in
      // MonatsVergleich skaliert jetzt passend mit.
      // `null` statt 0 bei einem Monat ohne Einnahmen: eine Sparquote von „0 %" behauptet
      // eine ausgeglichene Bilanz, tatsächlich ist die Quote ohne Einnahmen gar nicht
      // definiert. Die Linie bekommt an der Stelle eine Lücke (siehe MonthlyComparison).
      const sparquote = r.total_income > 0
        ? Math.round(((r.total_income - r.total_expenses) / r.total_income) * 100)
        : null
      return {
        month,
        einnahmen: Math.round(r.total_income),
        ausgaben:  Math.round(r.total_expenses),
        sparquote,
      }
    })
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; accounts?: string }>
}) {
  const [{ period: rawPeriod, accounts: rawAccounts }, { supabase, user }] = await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  const [{ data: accountRows }, settings] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, color')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    getSettings(user.id),
  ])

  const accounts = (accountRows ?? []) as AccountRow[]
  const accountIds = new Set(accounts.map(a => a.id))

  // Zeitraum: explicit URL param wins, else the saved Settings-Standard, else '1J'.
  const defaultPeriod = VALID.includes(settings.analyse_default_period as Period)
    ? (settings.analyse_default_period as Period)
    : '1J'
  const period: Period = VALID.includes(rawPeriod as Period) ? (rawPeriod as Period) : defaultPeriod

  // Heatmap-Ansicht: same fallback shape, just seeds the client component's initial state
  // (nothing to persist in the URL for this one).
  const defaultHeatmapMode = HEATMAP_MODES.includes(settings.analyse_default_heatmap_mode as HeatmapMode)
    ? (settings.analyse_default_heatmap_mode as HeatmapMode)
    : 'ausgaben'

  // Der Cutoff kommt aus lib/period statt aus einer eigenen Rechnung. Die frühere lokale
  // getCutoff() hatte drei Fehler: `toISOString()` rechnet erst nach UTC um und lieferte
  // zwischen 0 und 2 Uhr MESZ den Vortag; `setMonth(getMonth() - 1)` läuft am Monatsende
  // über (31.03. minus ein Monat ergibt in JS den 03.03., also ein 28-Tage-Fenster); und
  // für „Alles" kam '2000-01-01' zurück statt gar keinem Filter — Buchungen davor wären
  // stillschweigend verschwunden. `null` heißt jetzt explizit: nicht nach Datum filtern.
  const cutoff = periodCutoff(period)

  // Current + adjacent months for calendar (3-month window so user can navigate)
  const now = new Date()
  const calStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const calEnd   = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0]
  // Trailing 24-month window, independent of `period` — covers both the
  // Monatsvergleich (nur die letzten 6, siehe buildMonthlyComparison) und die
  // KDE-Ausgabenverteilung (bis zu 24 abgeschlossene Monate, siehe
  // buildExpenseHistory). Ein Fetch statt zwei getrennter Fenster.
  const monthlyCutoff = new Date(now.getFullYear(), now.getMonth() - 23, 1).toISOString().split('T')[0]
  const currentMonthKey = now.toISOString().slice(0, 7)

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
  const hasAccountFilter = selectedAccountIds.length > 0

  const [txnRes, calRes, monthlyRes, monthlyTxnRes] = await Promise.all([
    // Transactions for period (heatmap, categories, sankey) — unified_transactions merges in
    // FinTS-synced bank transactions for accounts linked via accounts.bank_iban.
    (() => {
      let q = supabase
        .from('unified_transactions')
        .select('date, type, amount, amount_base, category_name, description, merchant')
        .eq('user_id', user.id)
        .in('type', ['income', 'expense'])
        // Nur echte Einnahmen/Ausgaben — Umbuchungen, Anlagen (Krypto/Depot/Bausparer),
        // Forderungen und Anfangsbestaende zaehlen hier nicht mit.
        .eq('flow_kind', 'echt')
      if (cutoff) q = q.gte('date', cutoff)
      if (hasAccountFilter) q = q.in('account_id', selectedAccountIds)
      return q.order('date')
    })(),

    // Transactions for calendar (3-month window, independent of period)
    (() => {
      let q = supabase
        .from('unified_transactions')
        .select('date, type, amount, category_name, description, merchant')
        .eq('user_id', user.id)
        .gte('date', calStart)
        .lte('date', calEnd)
        .in('type', ['income', 'expense'])
        // Nur echte Einnahmen/Ausgaben — Umbuchungen, Anlagen (Krypto/Depot/Bausparer),
        // Forderungen und Anfangsbestaende zaehlen hier nicht mit.
        .eq('flow_kind', 'echt')
      if (hasAccountFilter) q = q.in('account_id', selectedAccountIds)
      return q.order('date')
    })(),

    // Monthly summaries for MonatsVergleich — the precomputed table has no account_id,
    // so it's only used when there's no Konten-Filter (see buildMonthlyComparisonFromTxns).
    hasAccountFilter
      ? Promise.resolve(null)
      : supabase
          .from('monthly_finance_summary')
          // Explizit auf den User filtern, obwohl RLS das ohnehin tut: fn_take_snapshot
          // schreibt eine Zeile pro auth.user, in der Tabelle stehen also auch fremde
          // Monate. Ohne den Filter haengt die Richtigkeit dieser Seite allein an einer
          // Policy — und `limit(25)` wuerde als Erstes zuschlagen, nicht der Besitz.
          .select('month, total_income, total_expenses')
          .eq('user_id', user.id)
          .order('month', { ascending: false })
          .limit(25),

    // Transactions for the 24-month window (Monatsvergleich + KDE-Ausgabenverteilung),
    // only fetched when filtering by account.
    hasAccountFilter
      ? supabase
          .from('unified_transactions')
          .select('date, type, amount, amount_base')
          .eq('user_id', user.id)
          .gte('date', monthlyCutoff)
          .in('type', ['income', 'expense'])
          // Nur echte Einnahmen/Ausgaben — siehe unified_transactions.flow_kind.
          .eq('flow_kind', 'echt')
          .in('account_id', selectedAccountIds)
          .order('date')
      : Promise.resolve(null),
  ])

  const txns    = (txnRes.data  ?? []) as TxnRow[]
  const calTxns = (calRes.data  ?? []) as TxnRow[]

  const heatmapData      = buildHeatmap(txns)
  const categoryData     = buildCategories(txns)
  const sankeyData       = buildSankey(txns)
  const cashflowEvents   = buildCashflow(calTxns)
  const monthlyRows    = (monthlyRes?.data ?? []) as MonthlySummaryRow[]
  const monthlyTxns    = (monthlyTxnRes?.data ?? []) as Pick<TxnRow, 'date' | 'type' | 'amount' | 'amount_base'>[]
  const monthlyComparison = hasAccountFilter
    ? buildMonthlyComparisonFromTxns(monthlyTxns, currentMonthKey)
    : buildMonthlyComparison(monthlyRows, currentMonthKey)
  const monthSeries = hasAccountFilter
    ? buildMonthSeriesFromTxns(monthlyTxns, currentMonthKey)
    : buildMonthSeries(monthlyRows, currentMonthKey)
  const thisMonth = currentMonthTotals(txns, currentMonthKey)

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
            <AnalyseAccountSelector accounts={accounts} selected={selectedAccountIds} />
            <AnalysePeriodSelector current={period} />
          </div>
        </div>

        <FilterPending className="space-y-6">
          <div className="space-y-6">
            {/* Heatmap */}
            <AusgabenHeatmap data={heatmapData} initialMode={defaultHeatmapMode} />

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

            {/* Verteilung — eigene, kategorieunabhängige Sicht auf die Monatssummen,
                deshalb immer über den vollen 24-Monats-Horizont statt der
                `period`-Auswahl (der Konten-Filter greift dagegen schon). */}
            <MonatsVerteilung history={monthSeries} current={thisMonth} />
          </div>
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
