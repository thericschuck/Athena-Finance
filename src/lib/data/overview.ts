import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner } from '@/lib/data/scope-owner'
import { lies } from '@/lib/data/lies'
import { getAccounts, getUnifiedBalanceSumsMitAnzahl, type BalanceSum as GeteilteSaldensumme } from '@/lib/data/finance-accounts'
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

/**
 * Alle Konten (auch inaktive) — das Dashboard filtert aktive selbst.
 * Dieselbe Abfrage wie die Prognose und die Konten-Seiten (getAccounts, pro Request einmal; AUDIT.md C2): die Zeilen enthalten
 * mehr Spalten, als `DashboardAccount` nennt, das stoert nicht. Gleiche Reihenfolge (sort_order, dann created_at).
 */
export async function getDashboardAccounts(supabase: Client, ctx: ScopeContext): Promise<DashboardAccount[]> {
  return (await getAccounts(supabase, ctx)) as DashboardAccount[]
}

export type BalanceSum = GeteilteSaldensumme

/**
 * Buchungssumme je Konto (income +, expense −) aus der View `account_balance_sums_unified`, siehe getUnifiedBalanceSumsMitAnzahl
 * (finance-accounts.ts): eine Abfrage pro Request, geteilt mit der Prognose.
 */
export async function getBalanceSums(supabase: Client, ctx: ScopeContext): Promise<BalanceSum[]> {
  return getUnifiedBalanceSumsMitAnzahl(supabase, ctx)
}

export type OpenSavingsGoal = {
  id: string; current_amount: number; target_amount: number; description: string; status: string
}

export async function getOpenSavingsGoals(supabase: Client, ctx: ScopeContext): Promise<OpenSavingsGoal[]> {
  return lies(
    scopedOwner(supabase.from('savings_goals').select('id, current_amount, target_amount, description, status'), ctx)
      .eq('status', 'offen'),
    'savings_goals',
  )
}

export type DashboardCryptoAsset = {
  id: string; symbol: string; name: string | null; portfolio_name: string | null
  quantity: number | null; avg_buy_price: number | null
}

export async function getDashboardCryptoAssets(supabase: Client, ctx: ScopeContext): Promise<DashboardCryptoAsset[]> {
  const data = await lies(
    scopedOwner(supabase.from('assets').select('id, symbol, name, portfolio_name, quantity, avg_buy_price'), ctx)
      .in('type', ['crypto', 'stable', 'fiat']),
    'assets',
  )
  return data as DashboardCryptoAsset[]
}

export type AssetValuationLite = { asset_id: string; price_per_unit: number; total_value: number }

/** Neuester Bewertungseintrag je Asset (View `asset_valuations_latest`, ein Eintrag pro Asset). */
export async function getLatestAssetValuations(supabase: Client, assetIds: string[]): Promise<AssetValuationLite[]> {
  if (assetIds.length === 0) return []
  const data = await lies(
    supabase
      .from('asset_valuations_latest')
      .select('asset_id, price_per_unit, total_value')
      .in('asset_id', assetIds),
    'asset_valuations_latest',
  )
  return data as AssetValuationLite[]
}

export type ActiveContract = {
  id: string; name: string; provider: string | null; frequency: string
  amount: number; currency: string; end_date: string | null
  notice_days: number; auto_renews: boolean; account_id: string | null
  /** Vertragsart (`abo`, `transfer`, `savings_plan`, `building_savings` …). */
  type?: string
}

export async function getActiveContracts(supabase: Client, ctx: ScopeContext): Promise<ActiveContract[]> {
  const data = await lies(
    scopedOwner(
      supabase.from('contracts').select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews,account_id,type'),
      ctx,
    ).eq('is_active', true),
    'contracts',
  )
  return data as ActiveContract[]
}

export type InsightListRow = {
  id: string; type: string; severity: string; title: string; body: string | null; created_at: string
}

export type InsightRow = InsightListRow & { dismissed_at: string | null }

/**
 * Hinweise der Person, neueste zuerst. Eine Abfrage fuer Dashboard (nur offene, `getOpenInsights`) und Athena-Werkzeug
 * `getInsights` (optional auch weggeklickte, bis ROW_CAP): damit die Regeln (OWNER-ONLY, Sortierung) an EINER Stelle stehen.
 * OWNER-ONLY: Athena-Hinweise gehoeren der Person, nie dem Scope (daher userId statt ScopeContext). Wirft bei Lesefehlern.
 */
export async function getInsights(
  supabase: Client, userId: string, opts: { includeDismissed?: boolean; limit?: number } = {},
): Promise<InsightRow[]> {
  let q = supabase
    .from('insights')
    .select('id, type, severity, title, body, created_at, dismissed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 6)
  if (!opts.includeDismissed) q = q.is('dismissed_at', null)
  return (await lies(q, 'insights')) as InsightRow[]
}

/** Offene Hinweise, die Athena angelegt hat (lib/assistant/actions/insights.ts, createInsight). Neueste 6. */
export async function getOpenInsights(supabase: Client, userId: string, limit = 6): Promise<InsightListRow[]> {
  const zeilen = await getInsights(supabase, userId, { limit })
  return zeilen.map(({ id, type, severity, title, body, created_at }) => ({ id, type, severity, title, body, created_at }))
}

export type DashboardValuable = {
  aktueller_wert: number | null; kaufpreis: number | null; im_vermoegen: boolean | null
}

/** Inventar (bewusst nicht im Net Worth, siehe Migration 20260831000002). */
export async function getActiveValuables(supabase: Client, ctx: ScopeContext): Promise<DashboardValuable[]> {
  const q = supabase.from('valuables_current').select('aktueller_wert, kaufpreis, im_vermoegen')
  const data = await lies(scopedOwner(q, ctx).eq('is_active', true), 'valuables_current')
  return data as DashboardValuable[]
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
  const data = await lies(
    supabase
      .from('net_worth_snapshots')
      .select('snapshot_date,net_worth,total_checking,total_investment,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets')
      .eq('user_id', ctx.userId)
      .gte('snapshot_date', fromDate)
      .order('snapshot_date'),
    'net_worth_snapshots',
  )
  return data as NetWorthSnapshotLite[]
}

// ─── Analyse ─────────────────────────────────────────────────────────────────
// Einnahmen/Ausgaben (Buchungen, Monatssummen) liegen in lib/data/flows.ts.

// ─── Analyse / Verlauf ────────────────────────────────────────────────────────

export type HistoryAccount = { id: string; name: string; type: string; color: string | null }

export async function getHistoryAccounts(supabase: Client, ctx: ScopeContext): Promise<HistoryAccount[]> {
  const q = supabase.from('accounts').select('id, name, type, color')
  const data = await lies(applyAccountScope(q, ctx, 'id'), 'accounts')
  return data as HistoryAccount[]
}

export type AccountBalanceHistoryRow = {
  id: string; account_id: string; snapshot_date: string; balance: number; currency: string; source: string
}

export type HistoryAsset = { id: string; name: string; symbol: string; type: string }

export async function getHistoryAssets(supabase: Client, ctx: ScopeContext): Promise<HistoryAsset[]> {
  const data = await lies(scopedOwner(supabase.from('assets').select('id, name, symbol, type'), ctx), 'assets')
  return data as HistoryAsset[]
}

export type PortfolioSnapshotHistoryRow = {
  id: string; asset_id: string; snapshot_date: string; portfolio_name: string | null
  quantity: number; price_eur: number | null; value_eur: number | null; source: string
}
