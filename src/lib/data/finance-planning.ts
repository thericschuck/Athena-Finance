import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyOwnerScope, type ScopeContext } from '@/lib/haushalt/scope'
import { istScopeContext, userIdVon, type ScopeArg } from '@/lib/data/scope-arg'

type DB = SupabaseClient<Database>

const CONTRACT_COLUMNS =
  'id, name, type, provider, amount, currency, frequency, start_date, end_date, notice_days, auto_renews, billing_day, is_active, notes, account_id, to_account_id, category_id, shared'
const DEBT_COLUMNS =
  'id, name, type, creditor, currency, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active, notes, shared'
const GOAL_COLUMNS =
  'id, description, notes, status, priority, target_amount, current_amount, target_date, monthly_savings_rate, savings_rate_start_date, shared'
const SAVINGS_PLAN_COLUMNS = 'id, fund_name, isin, monthly_amount, execution_day, is_active'

export type ContractRow = Pick<
  Database['public']['Tables']['contracts']['Row'],
  | 'id' | 'name' | 'type' | 'provider' | 'amount' | 'currency' | 'frequency' | 'start_date' | 'end_date'
  | 'notice_days' | 'auto_renews' | 'billing_day' | 'is_active' | 'notes' | 'account_id' | 'to_account_id' | 'category_id'
> & { shared?: boolean }

export type DebtRow = Pick<
  Database['public']['Tables']['debts']['Row'],
  | 'id' | 'name' | 'type' | 'creditor' | 'currency' | 'original_amount' | 'outstanding'
  | 'interest_rate' | 'monthly_payment' | 'due_date' | 'is_active' | 'notes'
> & { shared?: boolean }

export type SavingsGoalRow = Pick<
  Database['public']['Tables']['savings_goals']['Row'],
  | 'id' | 'description' | 'notes' | 'status' | 'priority' | 'target_amount' | 'current_amount'
  | 'target_date' | 'monthly_savings_rate' | 'savings_rate_start_date'
> & { shared?: boolean }

export type SavingsPlanRow = Pick<
  Database['public']['Tables']['savings_plans']['Row'],
  'id' | 'fund_name' | 'isin' | 'monthly_amount' | 'execution_day' | 'is_active'
>

/** Alle Verträge, nach Name. Unbegrenzt (kleine Stammdatenliste). */
export async function getContracts(supabase: DB, ctx: ScopeContext): Promise<ContractRow[]> {
  const { data } = await applyOwnerScope(supabase.from('contracts').select(CONTRACT_COLUMNS), ctx)
    .order('name')
  return data ?? []
}

/** Ein Vertrag per ID, oder null. */
export async function getContract(supabase: DB, id: string): Promise<ContractRow | null> {
  // Einzelzugriff per ID: die RLS begrenzt auf den Haushalt (Detailseite zeigt auch Partner-Vertraege).
  const { data } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('id', id)
    .single()
  return data
}

/**
 * Sparpläne (Depot) für die Vertragsübersicht, nach Anlagedatum.
 * Die Server Action `getSavingsPlans` in app/actions/depot.ts gehört zur Depot-Domäne.
 */
export async function getSavingsPlansForContracts(supabase: DB, ctx: ScopeContext): Promise<SavingsPlanRow[]> {
  const { data } = await applyOwnerScope(supabase.from('savings_plans').select(SAVINGS_PLAN_COLUMNS), ctx)
    .order('created_at')
  return data ?? []
}

/** Schulden, neueste zuerst. `onlyActive` filtert auf aktive Einträge. */
export async function getDebts(
  supabase: DB,
  ctx: ScopeContext,
  opts: { onlyActive?: boolean } = {},
): Promise<DebtRow[]> {
  let query = applyOwnerScope(supabase.from('debts').select(DEBT_COLUMNS), ctx)
    .order('created_at', { ascending: false })
  if (opts.onlyActive) query = query.eq('is_active', true)
  const { data } = await query
  return data ?? []
}

/** Aktive Schulden (Schulden-Vorschlag in der Transaktionsliste), unsortiert wie bisher. */
export async function getActiveDebts(supabase: DB, who: ScopeArg): Promise<DebtRow[]> {
  const q = supabase.from('debts').select(DEBT_COLUMNS)
  const { data } = await (istScopeContext(who) ? applyOwnerScope(q, who) : q.eq('user_id', userIdVon(who))).eq('is_active', true)
  return data ?? []
}

/** Sparziele, neueste zuerst. */
export async function getSavingsGoals(supabase: DB, ctx: ScopeContext): Promise<SavingsGoalRow[]> {
  const { data } = await applyOwnerScope(supabase.from('savings_goals').select(GOAL_COLUMNS), ctx)
    .order('created_at', { ascending: false })
  return data ?? []
}

/** Stand eines einzelnen Sparziels (für das Aufstocken in `addGoalPayment`). */
export async function getSavingsGoalProgress(supabase: DB, goalId: string) {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('current_amount, target_amount')
    .eq('id', goalId)
    .single()
  return { data, error }
}
