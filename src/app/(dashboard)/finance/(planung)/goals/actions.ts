'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optDate, optEnum, optMoneyField, moneyField, MAX_AMOUNT } from '@/lib/api/schemas'
import { getSavingsGoalProgress } from '@/lib/data/finance-planning'

export type GoalActionState = { error: string } | { success: true } | null

const goalFields = {
  description: reqText('Bezeichnung ist erforderlich', 200),
  target_amount: moneyField('Zielbetrag muss größer als 0 sein').refine(n => n > 0, 'Zielbetrag muss größer als 0 sein'),
  monthly_savings_rate: optMoneyField('Sparrate ist ungültig'),
  savings_rate_start_date: optDate,
  priority: optEnum(['hoch', 'mittel', 'niedrig'] as const, 'Priorität ist ungültig'),
  target_date: optDate,
  notes: optText(2000),
}
const createGoalSchema = z.object(goalFields)
const updateGoalSchema = z.object({ id: idField(), ...goalFields })

/** Sparrate nur, wenn > 0; Startdatum dann Formularwert oder heute. */
function rateFields(d: { monthly_savings_rate: number | null; savings_rate_start_date: string | null }) {
  const hasRate = d.monthly_savings_rate !== null && d.monthly_savings_rate > 0
  return {
    monthly_savings_rate: hasRate ? d.monthly_savings_rate : null,
    savings_rate_start_date: hasRate
      ? d.savings_rate_start_date || new Date().toISOString().split('T')[0]
      : null,
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createGoalSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const d = parsed.data

  const { error } = await supabase.from('savings_goals').insert({
    description: d.description,
    target_amount: d.target_amount,
    status: 'offen',
    user_id: user.id,
    priority: d.priority,
    ...rateFields(d),
    target_date: d.target_date,
    notes: d.notes,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateGoalSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...d } = parsed.data

  const { error } = await supabase
    .from('savings_goals')
    .update({
      description: d.description,
      target_amount: d.target_amount,
      priority: d.priority,
      ...rateFields(d),
      target_date: d.target_date,
      notes: d.notes,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Toggle status (bound action — called via form action bind) ───────────────
export async function setGoalStatus(id: string, newStatus: string): Promise<void> {
  const { supabase, user } = await getAuthUser()
  if (!user) return
  if (!parseInput(z.object({ id: uuid, status: z.enum(['offen', 'geschlossen']) }), { id, status: newStatus }).ok) return

  await supabase
    .from('savings_goals')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/finance/goals')
}

// ─── Add payment (increment current_amount) ───────────────────────────────────
export async function addGoalPayment(
  goalId: string,
  amount: number
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ goalId: uuid, amount: z.number().positive('Betrag muss größer als 0 sein').max(MAX_AMOUNT) }),
    { goalId, amount },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { data: goal, error: fetchErr } = await getSavingsGoalProgress(supabase, user.id, goalId)

  if (fetchErr || !goal) return { error: 'Sparziel nicht gefunden' }

  const currentAmount = goal.current_amount ?? 0
  const newAmount = Math.min(currentAmount + amount, goal.target_amount)

  const { error } = await supabase
    .from('savings_goals')
    .update({ current_amount: newAmount, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return {}
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteGoal(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return {}
}
