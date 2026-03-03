'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type GoalActionState = { error: string } | { success: true } | null

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const description = (formData.get('description') as string)?.trim()
  const target_amount = parseFloat(formData.get('target_amount') as string)

  if (!description) return { error: 'Bezeichnung ist erforderlich' }
  if (isNaN(target_amount) || target_amount <= 0) return { error: 'Zielbetrag muss größer als 0 sein' }

  const { error } = await supabase.from('savings_goals').insert({
    description,
    target_amount,
    status: 'open',
    user_id: user.id,
    priority: (formData.get('priority') as string) || null,
    monthly_savings_rate: formData.get('monthly_savings_rate')
      ? parseFloat(formData.get('monthly_savings_rate') as string)
      : null,
    target_date: (formData.get('target_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateGoal(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id = formData.get('id') as string
  const description = (formData.get('description') as string)?.trim()
  const target_amount = parseFloat(formData.get('target_amount') as string)

  if (!id) return { error: 'ID fehlt' }
  if (!description) return { error: 'Bezeichnung ist erforderlich' }
  if (isNaN(target_amount) || target_amount <= 0) return { error: 'Zielbetrag muss größer als 0 sein' }

  const { error } = await supabase
    .from('savings_goals')
    .update({
      description,
      target_amount,
      priority: (formData.get('priority') as string) || null,
      monthly_savings_rate: formData.get('monthly_savings_rate')
        ? parseFloat(formData.get('monthly_savings_rate') as string)
        : null,
      target_date: (formData.get('target_date') as string) || null,
      notes: (formData.get('notes') as string) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return { success: true }
}

// ─── Toggle status (bound action — called via form action bind) ───────────────
export async function setGoalStatus(id: string, newStatus: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('savings_goals')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/finance/goals')
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteGoal(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/goals')
  return {}
}
