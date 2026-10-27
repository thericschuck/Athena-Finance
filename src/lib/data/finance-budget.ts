import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyOwnerScope } from '@/lib/haushalt/scope'
import { istScopeContext, userIdVon, type ScopeArg } from '@/lib/data/scope-arg'

type DB = SupabaseClient<Database>

// ─── Lebenshaltungskosten / Budget ────────────────────────────────────────────────────────

/** Alle Budget-Kategorien (kleine Stammdatenliste), nach sort_order, dann Name. */
export async function getBudgetCategories(supabase: DB, who: ScopeArg) {
  const q = supabase.from('budget_categories').select('id, name, icon, monthly_budget, sort_order, shared')
  const { data } = await (istScopeContext(who) ? applyOwnerScope(q, who) : q.eq('user_id', userIdVon(who)))
    .order('sort_order')
    .order('name')
  return data ?? []
}

/** Alle Budget-Posten, nach Name. */
export async function getBudgetItems(supabase: DB, who: ScopeArg) {
  const q = supabase.from('budget_items').select('id, category_id, name, unit_price, quantity, interval_days, notes')
  const { data } = await (istScopeContext(who) ? applyOwnerScope(q, who) : q.eq('user_id', userIdVon(who)))
    .order('name')
  return data ?? []
}

/** Einkommensziel: OWNER-ONLY (bleibt `user_id`, unabhaengig vom Scope). */
/** Das (erste) Einkommensziel, oder null. */
export async function getIncomeTarget(supabase: DB, who: ScopeArg) {
  const { data } = await supabase
    .from('income_targets')
    .select('id, label, buffer_pct, tax_pct, savings_pct')
    .eq('user_id', userIdVon(who))
    .order('created_at')
    .limit(1)
  return data?.[0] ?? null
}

// ─── Reports ──────────────────────────────────────────────────────────────────────────────

/**
 * Alle Reports, jüngste Periode zuerst — inkl. `html` (Vorschau im Client).
 * Unbegrenzt, Kandidat für Paginierung: `html` pro Zeile ist groß und wächst monatlich.
 */
export async function getReports(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('reports')
    .select('id, type, period_start, period_end, title, html, sent_at, generated_at')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
  return data ?? []
}

/** Offene Erinnerung an den Jahresreport (neueste nicht verworfene), oder null. */
export async function getAnnualReportReminder(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('insights')
    .select('id, title, body, payload')
    .eq('user_id', userId)
    .eq('type', 'annual_report_reminder')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/** Titel/HTML/PDF-Pfad eines Reports (E-Mail-Versand). */
export async function getReportForEmail(supabase: DB, userId: string, reportId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('title, html, pdf_path')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single()
  return { data, error }
}

/** PDF-Pfad eines Reports (signierter Download-Link). */
export async function getReportPdfPath(supabase: DB, userId: string, reportId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('pdf_path')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single()
  return { data, error }
}
