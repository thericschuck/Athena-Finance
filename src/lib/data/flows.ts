import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { FlowInclude, FlowRow } from '@/lib/finance/flow-calc'
import { applyAccountScope, type ScopeContext } from '../haushalt/scope.ts'

/**
 * EINZIGER Lesepfad für Einnahmen und Ausgaben.
 *
 * Dashboard, Analyse, Banking, Konto-Detail, Reports und Athena sollen ihre Summen hieraus
 * beziehen. Die Regel „was zählt als Einnahme/Ausgabe" steht in der Datenbank
 * (`unified_transactions.counts_in_flow`, Migration 20261021110000), nicht hier und nicht in
 * den Seiten. Umbuchungen zwischen eigenen Konten und Anfangsbestände kommen deshalb gar
 * nicht erst an.
 *
 * Beide Funktionen laden seitenweise: PostgREST deckelt jede Antwort still bei 1.000 Zeilen.
 */

type Client = SupabaseClient<Database>

export type FlowSource = 'manual' | 'bank_sync'

export type FlowScope = {
  /** Erster Tag (YYYY-MM-DD), inklusive. `null`/fehlend = nicht nach Datum filtern. */
  from?: string | null
  /** Letzter Tag (YYYY-MM-DD), inklusive. */
  to?: string | null
  accountIds?: string[]
  /** Nur diese Quelle, z. B. 'bank_sync' für die Rohdaten-Sicht. */
  source?: FlowSource
  /** Welche Arten zusätzlich zu `echt` mitzählen. Default: alle. */
  include?: FlowInclude
}

const PAGE = 1000
const MAX_PAGES = 50

type KontenQ<Q> = { in: (c: string, v: readonly string[]) => Q; eq: (c: string, v: string) => Q; or: (f: string) => Q }

/**
 * Scope-Filter der Abfrage: Konten im Scope (`account_id in ctx.accountIds`, eine explizite Kontenauswahl wird geschnitten).
 *
 * NUR BASIS: Umbuchungen (`flow_kind = 'umbuchung'`) sind haushaltsweit neutral und kommen hier nicht an. Die scope-abhaengige
 * Herabstufung (Umbuchung auf Konto im Scope, Gegenkonto ausserhalb = echte Buchung) macht ausschliesslich
 * `lib/data/flows-scope.ts` (`getMonthlyFlowsScope` / `getFlowTransactionsScope`).
 */
function kontenFilter<Q extends KontenQ<Q>>(q: Q, ctx: ScopeContext, accountIds: string[] | undefined): Q {
  if (accountIds?.length) {
    const erlaubt = new Set(ctx.accountIds)
    return q.in('account_id', accountIds.filter(id => erlaubt.has(id)))
  }
  return applyAccountScope(q, ctx)
}

/**
 * OWNER-ONLY-Filter fuer Service-Role-/Report-Pfade ohne Scope (Reports/EUeR): ausschliesslich `user_id = userId`, nie ein
 * Haushalts- oder Peer-Filter. Eine explizite Kontenauswahl wird nur zusaetzlich geschnitten.
 */
function nutzerFilter<Q extends KontenQ<Q>>(q: Q, userId: string, accountIds: string[] | undefined): Q {
  const r = q.eq('user_id', userId)
  return accountIds?.length ? r.in('account_id', accountIds) : r
}

/** Lieber ein Fehler als eine still zu kleine Summe: bei 50.000 Zeilen ist hier Schluss. */
function kappung(table: string): never {
  throw new Error(`${table}: mehr als ${PAGE * MAX_PAGES} Zeilen — Abfrage zu breit, Zeitraum oder Konten eingrenzen.`)
}

/** `flow_kind`-Werte, die zu einem `include` gehören. `echt` ist immer dabei. */
export function kindsFor(include: FlowInclude | undefined): string[] {
  const kinds = ['echt']
  if (!include || include.anlage) kinds.push('anlage')
  if (!include || include.forderung) kinds.push('forderung')
  return kinds
}

// ─── Monatssummen (monthly_flows) ────────────────────────────────────────────────────────

export type MonthlyFlowRow = FlowRow & {
  /** Erster Tag des Monats, YYYY-MM-DD. */
  month: string
  account_id: string | null
  source: string
  /** Vererbte Steuerrolle der Kategorie (z. B. lohn, betriebseinnahme), null = keine. */
  tax_role: string | null
  tx_count: number
}

const MONTHLY_COLUMNS =
  'month, account_id, source, flow_kind, category_id, category_name, root_category_id, root_category_name, tax_role_effective, income, expense, tx_count'

/**
 * Aggregierte Zeilen je Monat/Konto/Quelle/Art/Kategorie. Klein, auch für „Alles".
 * Beträge kommen als Zahl zurück (numeric wird von PostgREST teils als String geliefert).
 */
export async function getMonthlyFlows(supabase: Client, ctx: ScopeContext, scope: FlowScope = {}): Promise<MonthlyFlowRow[]> {
  return ladeMonthlyFlows(supabase, q => kontenFilter(q, ctx, scope.accountIds), scope)
}

type MonthlyQuery = ReturnType<typeof monthlyBasis>
function monthlyBasis(supabase: Client) {
  return supabase.from('monthly_flows').select(MONTHLY_COLUMNS)
}

async function ladeMonthlyFlows(supabase: Client, filter: (q: MonthlyQuery) => MonthlyQuery, scope: FlowScope): Promise<MonthlyFlowRow[]> {
  const out: MonthlyFlowRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = filter(monthlyBasis(supabase))
      .in('flow_kind', kindsFor(scope.include))
    // Der Monat reicht als Grenze: `from` mitten im Monat nimmt den ganzen Monat mit.
    if (scope.from) q = q.gte('month', scope.from.slice(0, 7) + '-01')
    if (scope.to) q = q.lte('month', scope.to.slice(0, 7) + '-01')
    if (scope.source) q = q.eq('source', scope.source)

    const { data, error } = await q
      .order('month', { ascending: true })
      .order('account_id', { ascending: true })
      .order('category_id', { ascending: true })
      .order('flow_kind', { ascending: true })
      .order('source', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`monthly_flows: ${error.message}`)
    if (!data || data.length === 0) break

    for (const r of data) {
      out.push({
        month: String(r.month),
        account_id: r.account_id,
        source: String(r.source),
        flow_kind: String(r.flow_kind),
        category_id: r.category_id,
        category_name: r.category_name,
        root_category_id: r.root_category_id,
        root_category_name: r.root_category_name,
        tax_role: r.tax_role_effective,
        income: Number(r.income ?? 0),
        expense: Number(r.expense ?? 0),
        tx_count: Number(r.tx_count ?? 0),
      })
    }
    if (data.length < PAGE) break
    if (page === MAX_PAGES - 1) kappung('monthly_flows')
  }
  return out
}

// ─── Einzelbuchungen (unified_transactions) ──────────────────────────────────────────────

export type FlowTransaction = {
  id: string
  date: string
  type: 'income' | 'expense'
  /** Betrag in EUR, immer positiv. */
  amount: number
  flow_kind: string
  source: string
  account_id: string | null
  category_id: string | null
  category_name: string | null
  root_category_id: string | null
  root_category_name: string | null
  description: string | null
  merchant: string | null
  /** Vererbte Steuerrolle der Kategorie, null = keine. */
  tax_role: string | null
  /** Nur im Haushalt gesetzt: haushaltsweite Umbuchung, die im Scope zur echten Buchung herabgestuft wurde (siehe flows-scope.ts). */
  herabgestuft?: boolean
}

const TX_COLUMNS =
  'id, date, type, amount_eur, flow_kind, source, account_id, category_id, category_name, root_category_id, root_category_name, description, merchant, tax_role_effective'

/**
 * Einzelne Einnahmen/Ausgaben (für Heatmap, Kalender, Sankey, Listen). Gleiche Regeln wie
 * `getMonthlyFlows`, nur auf Buchungsebene. Wächst mit dem Zeitraum — wo es um Monatssummen
 * geht, `getMonthlyFlows` nehmen.
 */
export async function getFlowTransactions(supabase: Client, ctx: ScopeContext, scope: FlowScope = {}): Promise<FlowTransaction[]> {
  return ladeFlowTransactions(supabase, q => kontenFilter(q, ctx, scope.accountIds), scope)
}

/**
 * Owner-only-Variante von `getFlowTransactions` fuer Reports/EUeR und andere Service-Role-Pfade: filtert NUR `user_id = userId`
 * (kein Haushalts-/Peer-Filter, keine Herabstufung).
 */
export async function getFlowTransactionsFuerNutzer(supabase: Client, userId: string, scope: FlowScope = {}): Promise<FlowTransaction[]> {
  return ladeFlowTransactions(supabase, q => nutzerFilter(q, userId, scope.accountIds), scope)
}

type TxQuery = ReturnType<typeof txBasis>
function txBasis(supabase: Client) {
  return supabase.from('unified_transactions').select(TX_COLUMNS)
}

async function ladeFlowTransactions(supabase: Client, filter: (q: TxQuery) => TxQuery, scope: FlowScope): Promise<FlowTransaction[]> {
  const out: FlowTransaction[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = filter(txBasis(supabase))
      .eq('counts_in_flow', true)
      .in('type', ['income', 'expense'])
      .in('flow_kind', kindsFor(scope.include))
    if (scope.from) q = q.gte('date', scope.from)
    if (scope.to) q = q.lte('date', scope.to)
    if (scope.source) q = q.eq('source', scope.source)

    // `id` als zweites Kriterium: `date` ist nicht eindeutig, ohne stabile Ordnung kämen
    // Zeilen zwischen zwei Seiten doppelt oder gar nicht.
    const { data, error } = await q
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`unified_transactions: ${error.message}`)
    if (!data || data.length === 0) break

    for (const r of data) {
      if (r.id === null || r.date === null) continue
      out.push({
        id: r.id,
        date: String(r.date).slice(0, 10),
        type: r.type === 'income' ? 'income' : 'expense',
        amount: Number(r.amount_eur ?? 0),
        flow_kind: String(r.flow_kind),
        source: String(r.source),
        account_id: r.account_id,
        category_id: r.category_id,
        category_name: r.category_name,
        root_category_id: r.root_category_id,
        root_category_name: r.root_category_name,
        description: r.description,
        merchant: r.merchant,
        tax_role: r.tax_role_effective,
      })
    }
    if (data.length < PAGE) break
    if (page === MAX_PAGES - 1) kappung('unified_transactions')
  }
  return out
}

/** Eine Einzelbuchung als FlowRow, damit sie in dieselben Rechenfunktionen wie die Monatssummen passt. */
export function txToFlowRow(tx: FlowTransaction): FlowRow {
  return {
    flow_kind: tx.flow_kind,
    income: tx.type === 'income' ? tx.amount : 0,
    expense: tx.type === 'expense' ? tx.amount : 0,
    root_category_id: tx.root_category_id,
    root_category_name: tx.root_category_name,
    category_id: tx.category_id,
    category_name: tx.category_name,
  }
}

// ─── Monatsübersicht (monthly_flow_totals) ──────────────────────────────────────────────

export type MonthlyTotalsPageRow = {
  month: string
  income: number
  expense: number
  echt_income: number
  echt_expense: number
  anlage_income: number
  anlage_expense: number
  forderung_income: number
  forderung_expense: number
  tx_count: number
}

/** Eine Seite der Monatsübersicht, jüngster Monat zuerst (Verlauf → Monatsübersicht). */
export async function getMonthlyTotalsPage(
  supabase: Client, userId: string, range: { from: number; to: number },
): Promise<{ rows: MonthlyTotalsPageRow[]; count: number }> {
  const { data, count, error } = await supabase
    .from('monthly_flow_totals')
    .select(
      'month, income, expense, echt_income, echt_expense, anlage_income, anlage_expense, forderung_income, forderung_expense, tx_count',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .range(range.from, range.to)
  if (error) throw new Error(`monthly_flow_totals: ${error.message}`)
  const n = (v: number | null) => Number(v ?? 0)
  return {
    rows: (data ?? []).map(r => ({
      month: String(r.month),
      income: n(r.income), expense: n(r.expense),
      echt_income: n(r.echt_income), echt_expense: n(r.echt_expense),
      anlage_income: n(r.anlage_income), anlage_expense: n(r.anlage_expense),
      forderung_income: n(r.forderung_income), forderung_expense: n(r.forderung_expense),
      tx_count: n(r.tx_count),
    })),
    count: count ?? 0,
  }
}
