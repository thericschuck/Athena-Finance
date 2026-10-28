import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner } from '@/lib/data/scope-owner'
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
 * Scope-Parameter `ctx`: Haushaltssicht (Konten `ctx.accountIds`, Inventar/Vertraege/Ziele/Assets nach `applyOwnerScope`).
 * OWNER-ONLY bleiben insights und net_worth_snapshots (Snapshots im Haushalt: lib/data/networth-reihe.ts).
 */

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardAccount = {
  id: string; name: string; type: string; color: string | null
  currency: string; is_active: boolean; bank_iban: string | null
}

/** Alle Konten (auch inaktive) — das Dashboard filtert aktive selbst. */
export async function getDashboardAccounts(supabase: Client, ctx: ScopeContext): Promise<DashboardAccount[]> {
  const q = supabase.from('accounts').select('id, name, type, color, currency, is_active, bank_iban')
  const { data } = await applyAccountScope(q, ctx, 'id')
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
export async function getBalanceSums(supabase: Client, ctx: ScopeContext): Promise<BalanceSum[]> {
  const q = supabase.from('account_balance_sums_unified').select('account_id, balance, tx_count')
  const { data } = await applyAccountScope(q, ctx)
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefüllt.
  const rows = (data ?? []) as BalanceSum[]
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

export async function getOpenSavingsGoals(supabase: Client, ctx: ScopeContext): Promise<OpenSavingsGoal[]> {
  const { data } = await scopedOwner(supabase.from('savings_goals').select('id, current_amount, target_amount, description, status'), ctx)
    .eq('status', 'offen')
  return data ?? []
}

export type DashboardCryptoAsset = {
  id: string; symbol: string; name: string | null; portfolio_name: string | null
  quantity: number | null; avg_buy_price: number | null
}

export async function getDashboardCryptoAssets(supabase: Client, ctx: ScopeContext): Promise<DashboardCryptoAsset[]> {
  const { data } = await scopedOwner(supabase.from('assets').select('id, symbol, name, portfolio_name, quantity, avg_buy_price'), ctx)
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

export async function getActiveContracts(supabase: Client, ctx: ScopeContext): Promise<ActiveContract[]> {
  const { data } = await scopedOwner(
    supabase.from('contracts').select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews,account_id,type'),
    ctx,
  ).eq('is_active', true)
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
    .eq('user_id', userId) // OWNER-ONLY: Athena-Hinweise gehoeren der Person, nie dem Scope (daher userId statt ScopeContext)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InsightListRow[]
}

export type DashboardValuable = {
  aktueller_wert: number | null; kaufpreis: number | null; im_vermoegen: boolean | null
}

/** Inventar (bewusst nicht im Net Worth, siehe Migration 20260831000002). */
export async function getActiveValuables(supabase: Client, ctx: ScopeContext): Promise<DashboardValuable[]> {
  const q = supabase.from('valuables_current').select('aktueller_wert, kaufpreis, im_vermoegen')
  const { data } = await scopedOwner(q, ctx).eq('is_active', true)
  return (data ?? []) as DashboardValuable[]
}

export type NetWorthSnapshotLite = {
  snapshot_date: string; net_worth: number
  total_checking: number; total_investment: number; total_savings: number; total_cash: number
  total_depot: number; total_crypto: number; total_bausparer: number; total_business: number
  total_debts: number; total_assets: number
}

/** Net-Worth-Snapshots ab `fromDate` (YYYY-MM-DD) für den Verlaufschart, aufsteigend. */
export async function getNetWorthSnapshotsSince(supabase: Client, ctx: ScopeContext, fromDate: string): Promise<NetWorthSnapshotLite[]> {
  // Haushalt mit Partner: berechnete Reihe aus net_worth_series (keine Doppelzaehlung des geteilten Kontos); sonst wie bisher
  // die eigenen net_worth_snapshots (OWNER-ONLY-Tabelle).
  if (nutztSnapshotFunktion(ctx)) {
    const { rows, fehler } = await getNetWorthReihe(supabase, ctx, fromDate)
    if (fehler) console.error(`[networth] net_worth_series: ${fehler}`)
    return rows
  }
  const { data } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date,net_worth,total_checking,total_investment,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets')
    .eq('user_id', ctx.userId)
    .gte('snapshot_date', fromDate)
    .order('snapshot_date')
  return (data ?? []) as NetWorthSnapshotLite[]
}

// ─── Analyse ─────────────────────────────────────────────────────────────────
// Einnahmen/Ausgaben (Buchungen, Monatssummen) liegen in lib/data/flows.ts.

export type ActiveAccountOption = { id: string; name: string; type: string; color: string | null }

/** Aktive Konten für Auswahl/Filter (Analyse-Kontofilter, Settings-Standardauswahl). */
export async function getActiveAccountOptions(supabase: Client, ctx: ScopeContext): Promise<ActiveAccountOption[]> {
  const q = supabase.from('accounts').select('id, name, type, color')
  const { data } = await applyAccountScope(q, ctx, 'id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as ActiveAccountOption[]
}

// ─── Analyse / Verlauf ────────────────────────────────────────────────────────

export type HistoryAccount = { id: string; name: string; type: string; color: string | null }

export async function getHistoryAccounts(supabase: Client, ctx: ScopeContext): Promise<HistoryAccount[]> {
  const q = supabase.from('accounts').select('id, name, type, color')
  const { data } = await applyAccountScope(q, ctx, 'id')
  return (data ?? []) as HistoryAccount[]
}

export type AccountBalanceHistoryRow = {
  id: string; account_id: string; snapshot_date: string; balance: number; currency: string; source: string
}

export type HistoryAsset = { id: string; name: string; symbol: string; type: string }

export async function getHistoryAssets(supabase: Client, ctx: ScopeContext): Promise<HistoryAsset[]> {
  const { data } = await scopedOwner(supabase.from('assets').select('id, name, symbol, type'), ctx)
  return (data ?? []) as HistoryAsset[]
}

export type PortfolioSnapshotHistoryRow = {
  id: string; asset_id: string; snapshot_date: string; portfolio_name: string | null
  quantity: number; price_eur: number | null; value_eur: number | null; source: string
}
