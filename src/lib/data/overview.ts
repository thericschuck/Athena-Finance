import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Datenzugriff für Dashboard, Analyse (inkl. Verlauf) und die zugehörigen Widgets.
 * Reine Funktionen: Client und userId kommen vom Aufrufer (getAuthUser()).
 *
 * Hinweis: Einige Queries (Konten, Transaktionen, Verträge, Schulden, Sparziele, Krypto-Assets)
 * gehören fachlich zu anderen Domänen. Sie sind hier bewusst dupliziert (Parallel-Refactoring)
 * und werden später mit src/lib/data/{finance,crypto,...}.ts konsolidiert.
 */

type Client = SupabaseClient<Database>

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardAccount = {
  id: string; name: string; type: string; color: string | null
  currency: string; is_active: boolean; bank_iban: string | null
}

/** Alle Konten (auch inaktive) — das Dashboard filtert aktive selbst. */
export async function getDashboardAccounts(supabase: Client, userId: string): Promise<DashboardAccount[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name, type, color, currency, is_active, bank_iban')
    .eq('user_id', userId)
    .order('sort_order')
  return (data ?? []) as DashboardAccount[]
}

export type BalanceSum = { account_id: string; balance: number; tx_count: number }

/**
 * Buchungssumme je Konto (income +, expense −) aus der View `account_balance_sums_unified`.
 * Bewusst OHNE flow_kind-Filter: ein Krypto-Kauf ist keine Ausgabe, senkt das Girokonto aber
 * sehr wohl. Aggregiert in der DB — das Laden aller Buchungen lief in PostgREST' 1.000-Zeilen-
 * Deckel und schnitt die Salden still ab.
 */
export async function getBalanceSums(supabase: Client, userId: string): Promise<BalanceSum[]> {
  const { data } = await supabase
    .from('account_balance_sums_unified')
    .select('account_id, balance, tx_count')
    .eq('user_id', userId)
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefüllt.
  return (data ?? []) as BalanceSum[]
}

export type MonthTxRow = { type: string; amount: number }

/** Echte Bewegungen (flow_kind = echt) ab `monthStart` (YYYY-MM-DD) — ohne Umbuchungen/Anlagen. */
export async function getRealTransactionsSince(supabase: Client, userId: string, monthStart: string): Promise<MonthTxRow[]> {
  const { data } = await supabase
    .from('unified_transactions')
    .select('type, amount')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .eq('flow_kind', 'echt')
  return (data ?? []) as MonthTxRow[]
}

export type ActiveDebt = { outstanding: number | null; type: string }

export async function getActiveDebts(supabase: Client, userId: string): Promise<ActiveDebt[]> {
  const { data } = await supabase
    .from('debts')
    .select('outstanding, type')
    .eq('user_id', userId)
    .eq('is_active', true)
  return (data ?? []) as ActiveDebt[]
}

export type OpenSavingsGoal = {
  id: string; current_amount: number; target_amount: number; description: string; status: string
}

export async function getOpenSavingsGoals(supabase: Client, userId: string): Promise<OpenSavingsGoal[]> {
  const { data } = await supabase
    .from('savings_goals')
    .select('id, current_amount, target_amount, description, status')
    .eq('user_id', userId)
    .eq('status', 'offen')
  return data ?? []
}

export type DashboardCryptoAsset = {
  id: string; symbol: string; name: string | null; portfolio_name: string | null
  quantity: number | null; avg_buy_price: number | null
}

export async function getDashboardCryptoAssets(supabase: Client, userId: string): Promise<DashboardCryptoAsset[]> {
  const { data } = await supabase
    .from('assets')
    .select('id, symbol, name, portfolio_name, quantity, avg_buy_price')
    .in('type', ['crypto', 'stable', 'fiat'])
    .eq('user_id', userId)
  return (data ?? []) as DashboardCryptoAsset[]
}

export type AssetValuationLite = { asset_id: string; price_per_unit: number; total_value: number }

/** Neuester Bewertungseintrag je Asset (View `asset_valuations_latest`, ein Eintrag pro Asset). */
export async function getLatestAssetValuations(supabase: Client, assetIds: string[]): Promise<AssetValuationLite[]> {
  if (assetIds.length === 0) return []
  const { data } = await supabase
    .from('asset_valuations_latest')
    .select('asset_id, price_per_unit, total_value')
    .in('asset_id', assetIds)
  return (data ?? []) as AssetValuationLite[]
}

export type ActiveContract = {
  id: string; name: string; provider: string | null; frequency: string
  amount: number; currency: string; end_date: string | null
  notice_days: number; auto_renews: boolean; account_id: string | null
}

export async function getActiveContracts(supabase: Client, userId: string): Promise<ActiveContract[]> {
  const { data } = await supabase
    .from('contracts')
    .select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews,account_id')
    .eq('user_id', userId)
    .eq('is_active', true)
  return (data ?? []) as ActiveContract[]
}

export type InsightListRow = {
  id: string; type: string; severity: string; title: string; body: string | null; created_at: string
}

/** Offene Hinweise, die Athena angelegt hat (lib/assistant/actions/insights.ts, createInsight). Neueste 6. */
export async function getOpenInsights(supabase: Client, userId: string, limit = 6): Promise<InsightListRow[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, type, severity, title, body, created_at')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InsightListRow[]
}

export type DashboardValuable = {
  aktueller_wert: number | null; kaufpreis: number | null; im_vermoegen: boolean | null
}

/** Inventar (bewusst nicht im Net Worth, siehe Migration 20260831000002). */
export async function getActiveValuables(supabase: Client, userId: string): Promise<DashboardValuable[]> {
  const { data } = await supabase
    .from('valuables_current')
    .select('aktueller_wert, kaufpreis, im_vermoegen')
    .eq('user_id', userId)
    .eq('is_active', true)
  return (data ?? []) as DashboardValuable[]
}

/** Spalten, die FinanceAnalytics tatsächlich liest (Summary-Teilmenge). */
export type MonthlySummaryLite = {
  month: string; food: number; leisure: number; subscriptions: number
  pocket_money: number; other_expenses: number
  total_income: number; total_expenses: number; net_balance: number | null
}

/**
 * Monatszusammenfassungen ab `fromMonth` (YYYY-MM-01), aufsteigend. Zeitlich begrenzt (12 Monate),
 * dadurch klein.
 */
export async function getMonthlySummariesSince(supabase: Client, userId: string, fromMonth: string): Promise<MonthlySummaryLite[]> {
  const { data } = await supabase
    .from('monthly_finance_summary')
    .select('month, food, leisure, subscriptions, pocket_money, other_expenses, total_income, total_expenses, net_balance')
    .eq('user_id', userId)
    .gte('month', fromMonth)
    .order('month')
  return data ?? []
}

export type NetWorthSnapshotLite = {
  snapshot_date: string; net_worth: number
  total_checking: number; total_investment: number; total_savings: number; total_cash: number
  total_depot: number; total_crypto: number; total_bausparer: number; total_business: number
  total_debts: number; total_assets: number
}

/** Net-Worth-Snapshots ab `fromDate` (YYYY-MM-DD) für den Verlaufschart, aufsteigend. */
export async function getNetWorthSnapshotsSince(supabase: Client, userId: string, fromDate: string): Promise<NetWorthSnapshotLite[]> {
  const { data } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date,net_worth,total_checking,total_investment,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets')
    .eq('user_id', userId)
    .gte('snapshot_date', fromDate)
    .order('snapshot_date')
  return (data ?? []) as NetWorthSnapshotLite[]
}

export type BankBalanceRow = { account_iban: string; booked_balance: number }

export async function getBankBalances(supabase: Client, userId: string): Promise<BankBalanceRow[]> {
  const { data } = await supabase
    .from('bank_balance')
    .select('account_iban, booked_balance')
    .eq('user_id', userId)
  return (data ?? []) as BankBalanceRow[]
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

export type ActiveAccountOption = { id: string; name: string; type: string; color: string | null }

/** Aktive Konten für Auswahl/Filter (Analyse-Kontofilter, Settings-Standardauswahl). */
export async function getActiveAccountOptions(supabase: Client, userId: string): Promise<ActiveAccountOption[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name, type, color')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as ActiveAccountOption[]
}

export type AnalyseTxnRow = {
  date: string; type: string; amount: number; amount_base: number | null
  category_name: string | null; description: string | null; merchant: string | null
}

type AnalyseFilter = { accountIds?: string[] }

/**
 * Echte Einnahmen/Ausgaben für den Analysezeitraum (Heatmap, Kategorien, Sankey, laufender Monat).
 * `cutoff = null` heißt: nicht nach Datum filtern („Alles"). Unbegrenzt — wächst mit dem
 * Zeitraum; Kandidat für serverseitige Aggregation (Heatmap/Kategorien) bzw. Caching.
 */
export async function getAnalyseTransactions(
  supabase: Client, userId: string,
  opts: AnalyseFilter & { cutoff: string | null },
): Promise<AnalyseTxnRow[]> {
  let q = supabase
    .from('unified_transactions')
    .select('date, type, amount, amount_base, category_name, description, merchant')
    .eq('user_id', userId)
    .in('type', ['income', 'expense'])
    // Nur echte Einnahmen/Ausgaben — Umbuchungen, Anlagen (Krypto/Depot/Bausparer),
    // Forderungen und Anfangsbestände zählen hier nicht mit.
    .eq('flow_kind', 'echt')
  if (opts.cutoff) q = q.gte('date', opts.cutoff)
  if (opts.accountIds?.length) q = q.in('account_id', opts.accountIds)
  const { data } = await q.order('date')
  return (data ?? []) as AnalyseTxnRow[]
}

export type CalendarTxnRow = {
  date: string; type: string; amount: number
  category_name: string | null; description: string | null; merchant: string | null
}

/** Buchungen für den Cashflow-Kalender (Fenster [from, to], unabhängig vom Zeitraumfilter). */
export async function getCalendarTransactions(
  supabase: Client, userId: string,
  opts: AnalyseFilter & { from: string; to: string },
): Promise<CalendarTxnRow[]> {
  let q = supabase
    .from('unified_transactions')
    .select('date, type, amount, category_name, description, merchant')
    .eq('user_id', userId)
    .gte('date', opts.from)
    .lte('date', opts.to)
    .in('type', ['income', 'expense'])
    .eq('flow_kind', 'echt')
  if (opts.accountIds?.length) q = q.in('account_id', opts.accountIds)
  const { data } = await q.order('date')
  return (data ?? []) as CalendarTxnRow[]
}

export type MonthlyTotalsRow = { month: string; total_income: number; total_expenses: number }

/**
 * Vorberechnete Monatssummen (kein account_id — nur ohne Konten-Filter nutzbar).
 * `.limit(25)` ist Teil der bisherigen Seitenlogik (24 Monate + laufender), nicht neu.
 */
export async function getMonthlyTotals(supabase: Client, userId: string, limit = 25): Promise<MonthlyTotalsRow[]> {
  // Explizit auf den User filtern, obwohl RLS das ohnehin tut: fn_take_snapshot schreibt eine
  // Zeile pro auth.user, und `limit` würde sonst als Erstes zuschlagen, nicht der Besitz.
  const { data } = await supabase
    .from('monthly_finance_summary')
    .select('month, total_income, total_expenses')
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .limit(limit)
  return data ?? []
}

export type MonthlyTxnRow = { date: string; type: string; amount: number; amount_base: number | null }

/** Echte Buchungen ab `from` für ausgewählte Konten (24-Monats-Fenster von Vergleich + Verteilung). Unbegrenzt. */
export async function getMonthlyWindowTransactions(
  supabase: Client, userId: string,
  opts: { from: string; accountIds: string[] },
): Promise<MonthlyTxnRow[]> {
  const { data } = await supabase
    .from('unified_transactions')
    .select('date, type, amount, amount_base')
    .eq('user_id', userId)
    .gte('date', opts.from)
    .in('type', ['income', 'expense'])
    .eq('flow_kind', 'echt')
    .in('account_id', opts.accountIds)
    .order('date')
  return (data ?? []) as MonthlyTxnRow[]
}

// ─── Analyse / Verlauf (paginiert, `range` ist hier Teil der UI) ──────────────

export type PageRange = { from: number; to: number }

export type NetWorthHistoryRow = NetWorthSnapshotLite & { id: string; source: string }

export async function getNetWorthHistoryPage(
  supabase: Client, userId: string, range: PageRange,
): Promise<{ rows: NetWorthHistoryRow[]; count: number }> {
  const { data, count } = await supabase
    .from('net_worth_snapshots')
    .select(
      'id, snapshot_date, net_worth, total_assets, total_checking, total_investment, total_savings, total_cash, total_depot, total_crypto, total_bausparer, total_business, total_debts, source',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .range(range.from, range.to)
  return { rows: (data ?? []) as NetWorthHistoryRow[], count: count ?? 0 }
}

export type HistoryAccount = { id: string; name: string; type: string; color: string | null }

export async function getHistoryAccounts(supabase: Client, userId: string): Promise<HistoryAccount[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name, type, color')
    .eq('user_id', userId)
  return (data ?? []) as HistoryAccount[]
}

export type AccountBalanceHistoryRow = {
  id: string; account_id: string; snapshot_date: string; balance: number; currency: string; source: string
}

/** account_balances hat kein user_id → über die Konto-IDs des Users gefiltert (RLS zusätzlich). */
export async function getAccountBalanceHistoryPage(
  supabase: Client, accountIds: string[], range: PageRange,
): Promise<{ rows: AccountBalanceHistoryRow[]; count: number }> {
  const { data, count } = await supabase
    .from('account_balances')
    .select('id, account_id, snapshot_date, balance, currency, source', { count: 'exact' })
    .in('account_id', accountIds.length ? accountIds : ['__none__'])
    .order('snapshot_date', { ascending: false })
    .order('account_id')
    .range(range.from, range.to)
  return { rows: (data ?? []) as AccountBalanceHistoryRow[], count: count ?? 0 }
}

export type HistoryAsset = { id: string; name: string; symbol: string; type: string }

export async function getHistoryAssets(supabase: Client, userId: string): Promise<HistoryAsset[]> {
  const { data } = await supabase
    .from('assets')
    .select('id, name, symbol, type')
    .eq('user_id', userId)
  return (data ?? []) as HistoryAsset[]
}

export type PortfolioSnapshotHistoryRow = {
  id: string; asset_id: string; snapshot_date: string; portfolio_name: string | null
  quantity: number; price_eur: number | null; value_eur: number | null; source: string
}

export async function getPortfolioSnapshotHistoryPage(
  supabase: Client, userId: string, assetIds: string[], range: PageRange,
): Promise<{ rows: PortfolioSnapshotHistoryRow[]; count: number }> {
  const { data, count } = await supabase
    .from('portfolio_snapshots')
    .select('id, asset_id, snapshot_date, portfolio_name, quantity, price_eur, value_eur, source', { count: 'exact' })
    .eq('user_id', userId)
    .in('asset_id', assetIds.length ? assetIds : ['__none__'])
    .order('snapshot_date', { ascending: false })
    .order('asset_id')
    .range(range.from, range.to)
  return { rows: (data ?? []) as PortfolioSnapshotHistoryRow[], count: count ?? 0 }
}

export type MonthlyHistoryRow = {
  id: string; month: string; total_income: number; total_expenses: number; net_balance: number
  salary: number; food: number; leisure: number; subscriptions: number; savings_transfer: number
  pocket_money: number; other_income: number; other_expenses: number; source: string
}

export async function getMonthlyHistoryPage(
  supabase: Client, userId: string, range: PageRange,
): Promise<{ rows: MonthlyHistoryRow[]; count: number }> {
  const { data, count } = await supabase
    .from('monthly_finance_summary')
    .select(
      'id, month, total_income, total_expenses, net_balance, salary, food, leisure, subscriptions, savings_transfer, pocket_money, other_income, other_expenses, source',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .range(range.from, range.to)
  return { rows: (data ?? []) as MonthlyHistoryRow[], count: count ?? 0 }
}
