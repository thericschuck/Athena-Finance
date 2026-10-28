import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hatPartner, type ScopeContext } from '@/lib/haushalt/scope'
import { herabgestufteBuchungen, herabgestufteMonate, monatsTotals } from '@/lib/finance/herabstufung'
import {
  getFlowTransactions, getMonthlyFlows, getMonthlyTotalsPage, kindsFor,
  type FlowScope, type FlowTransaction, type MonthlyFlowRow, type MonthlyTotalsPageRow,
} from '@/lib/data/flows'

/**
 * Lesepfade fuer Dashboard, Analyse und Verlauf, die im Haushalt (Partner vorhanden) die HAUSHALTSWEITE Umbuchungsregel
 * nachziehen: `flow_kind = 'umbuchung'` ist haushaltsweit neutral, im Scope aber eine echte Buchung, wenn das Konto im Scope
 * liegt und das Gegenkonto fehlt oder ausserhalb liegt (`wirdHerabgestuft`, Regel in src/lib/haushalt/umbuchung.ts).
 *
 * EINZIGE Stelle der Herabstufung (flows.ts liefert nur die Basis, sonst wuerden die Zeilen doppelt zaehlen).
 * SCHALTER: `hatPartner(ctx)` (Nutzer mit Partner). Ohne Partner (heute Eric) laufen ausschliesslich die bisherigen
 * Abfragen (monthly_flows / unified_transactions / monthly_flow_totals) und es werden weder `counterpart_account_id` noch
 * `monthly_umbuchungen` angefasst — die Seiten brechen also auch ohne die Migration 20261029100000 nicht.
 */

type DB = SupabaseClient<Database>

const PAGE = 1000
const MAX_PAGES = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Konten im Scope, geschnitten mit einer expliziten Kontenauswahl (wie `kontenFilter` in flows.ts). */
function kontenImScope(ctx: ScopeContext, auswahl: string[] | undefined): string[] {
  if (!auswahl?.length) return ctx.accountIds
  const erlaubt = new Set(ctx.accountIds)
  return auswahl.filter(id => erlaubt.has(id))
}

// ─── Monatssummen ────────────────────────────────────────────────────────────────────────────

/** Wie `getMonthlyFlows`, im Haushalt zusaetzlich mit den herabgestuften Umbuchungen (flow_kind := flow_kind_extern). */
export async function getMonthlyFlowsScope(supabase: DB, ctx: ScopeContext, scope: FlowScope = {}): Promise<MonthlyFlowRow[]> {
  const basis = await getMonthlyFlows(supabase, ctx, scope)
  if (!hatPartner(ctx)) return basis

  const konten = kontenImScope(ctx, scope.accountIds)
  if (konten.length === 0) return basis
  const kinds = new Set(kindsFor(scope.include))
  const set = new Set(ctx.accountIds)
  const extra: MonthlyFlowRow[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase
      .from('monthly_umbuchungen')
      .select('month, account_id, counterpart_account_id, source, flow_kind_extern, category_id, category_name, root_category_id, root_category_name, tax_role_effective, income, expense, tx_count')
      .in('account_id', konten)
    if (scope.from) q = q.gte('month', scope.from.slice(0, 7) + '-01')
    if (scope.to) q = q.lte('month', scope.to.slice(0, 7) + '-01')
    if (scope.source) q = q.eq('source', scope.source)
    const { data, error } = await q
      .order('month', { ascending: true })
      .order('account_id', { ascending: true })
      .order('counterpart_account_id', { ascending: true })
      .order('category_id', { ascending: true })
      .order('source', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`monthly_umbuchungen: ${error.message}`)
    if (!data || data.length === 0) break
    extra.push(...herabgestufteMonate(data, set, kinds))
    if (data.length < PAGE) break
  }
  return extra.length ? [...basis, ...extra].sort((a, b) => a.month.localeCompare(b.month)) : basis
}

/**
 * Ersatz fuer `monthly_flow_totals` (pro user_id, nicht scope-faehig) im Haushalt: Summe aus monthly_flows
 * (account_id im Scope) plus herabgestufte Umbuchungen, je Monat. Jüngster Monat zuerst, wie getMonthlyTotalsPage.
 * Ohne Partner: unveraendert `monthly_flow_totals` (Regression).
 */
export async function getMonthlyTotalsScope(supabase: DB, ctx: ScopeContext): Promise<MonthlyTotalsPageRow[]> {
  if (!hatPartner(ctx)) {
    const { rows } = await getMonthlyTotalsPage(supabase, ctx.userId, { from: 0, to: 998 })
    return rows
  }
  return monatsTotals(await getMonthlyFlowsScope(supabase, ctx))
}

/** Monate (YYYY-MM-01, aufsteigend), in denen es im Scope Buchungen gibt: Ersatz fuer `select month from monthly_flow_totals`. */
export async function getFlowMonthsScope(supabase: DB, ctx: ScopeContext): Promise<string[]> {
  if (!hatPartner(ctx)) {
    const { data } = await supabase.from('monthly_flow_totals').select('month').eq('user_id', ctx.userId).order('month', { ascending: true })
    return (data ?? []).map(r => String(r.month).slice(0, 10))
  }
  const zeilen = await getMonthlyFlowsScope(supabase, ctx)
  return [...new Set(zeilen.map(z => z.month.slice(0, 10)))].sort()
}

// ─── Einzelbuchungen ─────────────────────────────────────────────────────────────────────────

const UMB_COLUMNS =
  'id, date, type, amount_eur, signed_amount, source, account_id, counterpart_account_id, flow_kind_extern, category_id, category_name, root_category_id, root_category_name, description, merchant, tax_role_effective'

/**
 * Wie `getFlowTransactions`, im Haushalt zusaetzlich mit den herabgestuften Umbuchungen. Manuelle Umbuchungen haben EINE Zeile
 * (Abgang auf `account_id`, Zugang auf `counterpart_account_id`); wie in der View monthly_umbuchungen zaehlt jede Seite aus
 * der Sicht ihres Kontos, die Zugangsseite bekommt die ID `<id>:zu`.
 */
export async function getFlowTransactionsScope(supabase: DB, ctx: ScopeContext, scope: FlowScope = {}): Promise<FlowTransaction[]> {
  const basis = await getFlowTransactions(supabase, ctx, scope)
  if (!hatPartner(ctx)) return basis

  const konten = kontenImScope(ctx, scope.accountIds).filter(id => UUID_RE.test(id))
  if (konten.length === 0) return basis
  const kinds = new Set(kindsFor(scope.include))
  const set = new Set(ctx.accountIds)
  const liste = konten.join(',')
  const extra: FlowTransaction[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase
      .from('unified_transactions')
      .select(UMB_COLUMNS)
      .eq('flow_kind', 'umbuchung')
      .or(`account_id.in.(${liste}),and(source.eq.manual,counterpart_account_id.in.(${liste}))`)
    if (scope.from) q = q.gte('date', scope.from)
    if (scope.to) q = q.lte('date', scope.to)
    if (scope.source) q = q.eq('source', scope.source)
    const { data, error } = await q
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`unified_transactions: ${error.message}`)
    if (!data || data.length === 0) break
    extra.push(...herabgestufteBuchungen(data, new Set(konten), set, kinds))
    if (data.length < PAGE) break
  }
  return extra.length ? [...basis, ...extra].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : basis
}
