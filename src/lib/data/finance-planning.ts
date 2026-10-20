import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

const CONTRACT_COLUMNS =
  'id, name, type, provider, amount, currency, frequency, start_date, end_date, notice_days, auto_renews, billing_day, is_active, notes, account_id, to_account_id, category_id'
const DEBT_COLUMNS =
  'id, name, type, creditor, currency, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active, notes'
const GOAL_COLUMNS =
  'id, description, notes, status, priority, target_amount, current_amount, target_date, monthly_savings_rate, savings_rate_start_date'
const SAVINGS_PLAN_COLUMNS = 'id, fund_name, isin, monthly_amount, execution_day, is_active'

export type ContractRow = Pick<
  Database['public']['Tables']['contracts']['Row'],
  | 'id' | 'name' | 'type' | 'provider' | 'amount' | 'currency' | 'frequency' | 'start_date' | 'end_date'
  | 'notice_days' | 'auto_renews' | 'billing_day' | 'is_active' | 'notes' | 'account_id' | 'to_account_id' | 'category_id'
>

export type DebtRow = Pick<
  Database['public']['Tables']['debts']['Row'],
  | 'id' | 'name' | 'type' | 'creditor' | 'currency' | 'original_amount' | 'outstanding'
  | 'interest_rate' | 'monthly_payment' | 'due_date' | 'is_active' | 'notes'
>

export type SavingsGoalRow = Pick<
  Database['public']['Tables']['savings_goals']['Row'],
  | 'id' | 'description' | 'notes' | 'status' | 'priority' | 'target_amount' | 'current_amount'
  | 'target_date' | 'monthly_savings_rate' | 'savings_rate_start_date'
>

export type SavingsPlanRow = Pick<
  Database['public']['Tables']['savings_plans']['Row'],
  'id' | 'fund_name' | 'isin' | 'monthly_amount' | 'execution_day' | 'is_active'
>

/** Alle Verträge, nach Name. Unbegrenzt (kleine Stammdatenliste). */
export async function getContracts(supabase: DB, userId: string): Promise<ContractRow[]> {
  const { data } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

/** Ein Vertrag per ID, oder null. */
export async function getContract(supabase: DB, userId: string, id: string): Promise<ContractRow | null> {
  const { data } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  return data
}

/**
 * Sparpläne (Depot) für die Vertragsübersicht, nach Anlagedatum.
 * Die Server Action `getSavingsPlans` in app/actions/depot.ts gehört zur Depot-Domäne.
 */
export async function getSavingsPlansForContracts(supabase: DB, userId: string): Promise<SavingsPlanRow[]> {
  const { data } = await supabase
    .from('savings_plans')
    .select(SAVINGS_PLAN_COLUMNS)
    .eq('user_id', userId)
    .order('created_at')
  return data ?? []
}

/** Schulden, neueste zuerst. `onlyActive` filtert auf aktive Einträge. */
export async function getDebts(
  supabase: DB,
  userId: string,
  opts: { onlyActive?: boolean } = {},
): Promise<DebtRow[]> {
  let query = supabase
    .from('debts')
    .select(DEBT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (opts.onlyActive) query = query.eq('is_active', true)
  const { data } = await query
  return data ?? []
}

/** Aktive Schulden (Schulden-Vorschlag in der Transaktionsliste), unsortiert wie bisher. */
export async function getActiveDebts(supabase: DB, userId: string): Promise<DebtRow[]> {
  const { data } = await supabase
    .from('debts')
    .select(DEBT_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
  return data ?? []
}

/** Sparziele, neueste zuerst. */
export async function getSavingsGoals(supabase: DB, userId: string): Promise<SavingsGoalRow[]> {
  const { data } = await supabase
    .from('savings_goals')
    .select(GOAL_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/** Stand eines einzelnen Sparziels (für das Aufstocken in `addGoalPayment`). */
export async function getSavingsGoalProgress(supabase: DB, userId: string, goalId: string) {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('current_amount, target_amount')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()
  return { data, error }
}
