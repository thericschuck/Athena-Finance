import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope } from '@/lib/haushalt/scope'
import { istScopeContext, userIdVon, type ScopeArg } from '@/lib/data/scope-arg'
import { scopedOwner } from '@/lib/data/scope-owner'
import { valuablesViewDirekt } from '@/lib/data/valuables-shared'
import { getNetWorthReihe, nutztSnapshotFunktion } from '@/lib/data/networth-reihe'

/**
 * Datenzugriff für Dashboard, Analyse (inkl. Verlauf) und die zugehörigen Widgets.
 * Reine Funktionen: Client und userId kommen vom Aufrufer (getAuthUser()).
 *
 * Einnahmen/Ausgaben (Buchungen, Monatssummen) stehen NICHT hier, sondern in flows.ts.
 * Schulden (`getActiveDebts`) und Bank-Salden (`getBankBalances`) kommen aus
 * finance-planning.ts bzw. finance-accounts.ts. Die übrigen Dashboard-Abfragen sind auf die
 * Spalten zugeschnitten, die das Dashboard braucht, und gehören fachlich teils zu anderen
 * Domänen (Konten, Verträge, Sparziele, Krypto-Assets) — eine Verschiebung wäre reine
 * Kosmetik und ist bewusst nicht Teil der Datenpool-Umstellung.
 */

type Client = SupabaseClient<Database>

/**
 * Scope-Parameter `who`: ScopeContext = Haushaltssicht (Konten `ctx.accountIds`, Inventar/Vertraege/Ziele/Assets nach
 * `applyOwnerScope`), string (userId) = bisheriges Verhalten (`user_id = userId`). OWNER-ONLY bleiben insights und
 * net_worth_snapshots (Snapshots im Haushalt: lib/data/networth-reihe.ts).
 */

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardAccount = {
  id: string; name: string; type: string; color: string | null
  currency: string; is_active: boolean; bank_iban: string | null
}

/** Alle Konten (auch inaktive) — das Dashboard filtert aktive selbst. */
export async function getDashboardAccounts(supabase: Client, who: ScopeArg): Promise<DashboardAccount[]> {
  const q = supabase.from('accounts').select('id, name, type, color, currency, is_active, bank_iban')
  const { data } = await (istScopeContext(who) ? applyAccountScope(q, who, 'id') : q.eq('user_id', who))
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
export async function getBalanceSums(supabase: Client, who: ScopeArg): Promise<BalanceSum[]> {
  const q = supabase.from('account_balance_sums_unified').select('account_id, balance, tx_count')
  const { data } = await (istScopeContext(who) ? applyAccountScope(q, who) : q.eq('user_id', who))
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefüllt.
  const rows = (data ?? []) as BalanceSum[]
  if (!istScopeContext(who)) return rows
  // Die View gruppiert nach (user_id, account_id): buchen zwei Mitglieder auf dasselbe Konto, gibt es zwei Zeilen, die zusammengehoeren.
  const je = new Map<string, BalanceSum>()
  for (const r of rows) {
    const alt = je.get(r.account_id)
    je.set(r.account_id, alt
      ? { account_id: r.account_id, balance: Number(alt.balance) + Number(r.balance), tx_count: Number(alt.tx_count) + Number(r.tx_count) }
      : r)
  }
  return [...je.values()]
}

export type OpenSavingsGoal = {
  id: string; current_amount: number; target_amount: number; description: string; status: string
}

export async function getOpenSavingsGoals(supabase: Client, who: ScopeArg): Promise<OpenSavingsGoal[]> {
  const { data } = await scopedOwner(supabase.from('savings_goals').select('id, current_amount, target_amount, description, status'), who)
    .eq('status', 'offen')
  return data ?? []
}

export type DashboardCryptoAsset = {
  id: string; symbol: string; name: string | null; portfolio_name: string | null
  quantity: number | null; avg_buy_price: number | null
}

export async function getDashboardCryptoAssets(supabase: Client, who: ScopeArg): Promise<DashboardCryptoAsset[]> {
  const { data } = await scopedOwner(supabase.from('assets').select('id, symbol, name, portfolio_name, quantity, avg_buy_price'), who)
    .in('type', ['crypto', 'stable', 'fiat'])
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
  /** Vertragsart (`abo`, `transfer`, `savings_plan`, `building_savings` …). */
  type?: string
}

export async function getActiveContracts(supabase: Client, who: ScopeArg): Promise<ActiveContract[]> {
  const { data } = await scopedOwner(
    supabase.from('contracts').select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews,account_id,type'),
    who,
  ).eq('is_active', true)
  return (data ?? []) as ActiveContract[]
}

export type InsightListRow = {
  id: string; type: string; severity: string; title: string; body: string | null; created_at: string
}

/** Offene Hinweise, die Athena angelegt hat (lib/assistant/actions/insights.ts, createInsight). Neueste 6. */
export async function getOpenInsights(supabase: Client, who: ScopeArg, limit = 6): Promise<InsightListRow[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, type, severity, title, body, created_at')
    .eq('user_id', userIdVon(who)) // OWNER-ONLY: Athena-Hinweise gehoeren der Person, nie dem Scope
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InsightListRow[]
}

export type DashboardValuable = {
  aktueller_wert: number | null; kaufpreis: number | null; im_vermoegen: boolean | null
}

/** Inventar (bewusst nicht im Net Worth, siehe Migration 20260831000002). */
export async function getActiveValuables(supabase: Client, who: ScopeArg): Promise<DashboardValuable[]> {
  const q = supabase.from('valuables_current').select('aktueller_wert, kaufpreis, im_vermoegen')
  if (!istScopeContext(who)) {
    const { data } = await q.eq('user_id', who).eq('is_active', true)
    return (data ?? []) as DashboardValuable[]
  }
  // Haushaltssicht: mit Schalter (Migration 20261102100000 live) direkt ueber `shared`, sonst Umweg ueber die Stueck-IDs.
  if (valuablesViewDirekt(who)) {
    const { data } = await scopedOwner(q, who).eq('is_active', true)
    return (data ?? []) as DashboardValuable[]
  }
  const { data: ids } = await scopedOwner(supabase.from('valuables').select('id'), who)
  const idListe = (ids ?? []).map(r => r.id)
  if (idListe.length === 0) return []
  const { data } = await q.in('id', idListe).eq('is_active', true)
  return (data ?? []) as DashboardValuable[]
}

export type NetWorthSnapshotLite = {
  snapshot_date: string; net_worth: number
  total_checking: number; total_investment: number; total_savings: number; total_cash: number
  total_depot: number; total_crypto: number; total_bausparer: number; total_business: number
  total_debts: number; total_assets: number
}

/** Net-Worth-Snapshots ab `fromDate` (YYYY-MM-DD) für den Verlaufschart, aufsteigend. */
export async function getNetWorthSnapshotsSince(supabase: Client, who: ScopeArg, fromDate: string): Promise<NetWorthSnapshotLite[]> {
  // Haushalt mit Partner: berechnete Reihe aus net_worth_series (keine Doppelzaehlung des geteilten Kontos); sonst wie bisher
  // die eigenen net_worth_snapshots (OWNER-ONLY-Tabelle).
  if (istScopeContext(who) && nutztSnapshotFunktion(who)) {
    const { rows, fehler } = await getNetWorthReihe(supabase, who, fromDate)
    if (fehler) console.error(`[networth] net_worth_series: ${fehler}`)
    return rows
  }
  const userId = userIdVon(who)
  const { data } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date,net_worth,total_checking,total_investment,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets')
    .eq('user_id', userId)
    .gte('snapshot_date', fromDate)
    .order('snapshot_date')
  return (data ?? []) as NetWorthSnapshotLite[]
}

// ─── Analyse ─────────────────────────────────────────────────────────────────
// Einnahmen/Ausgaben (Buchungen, Monatssummen) liegen in lib/data/flows.ts.

export type ActiveAccountOption = { id: string; name: string; type: string; color: string | null }

/** Aktive Konten für Auswahl/Filter (Analyse-Kontofilter, Settings-Standardauswahl). */
export async function getActiveAccountOptions(supabase: Client, who: ScopeArg): Promise<ActiveAccountOption[]> {
  const q = supabase.from('accounts').select('id, name, type, color')
  const { data } = await (istScopeContext(who) ? applyAccountScope(q, who, 'id') : q.eq('user_id', who))
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as ActiveAccountOption[]
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

export async function getHistoryAccounts(supabase: Client, who: ScopeArg): Promise<HistoryAccount[]> {
  const q = supabase.from('accounts').select('id, name, type, color')
  const { data } = await (istScopeContext(who) ? applyAccountScope(q, who, 'id') : q.eq('user_id', who))
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

export async function getHistoryAssets(supabase: Client, who: ScopeArg): Promise<HistoryAsset[]> {
  const { data } = await scopedOwner(supabase.from('assets').select('id, name, symbol, type'), who)
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
