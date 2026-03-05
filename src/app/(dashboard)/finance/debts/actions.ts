'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type DebtActionState = { error: string } | { success: true } | null

// ─── Create a new debt entry ──────────────────────────────────────────────────
export async function createDebt(
  _prev: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  const originalAmount = parseFloat(formData.get('original_amount') as string)
  const currency = formData.get('currency') as string

  if (!name) return { error: 'Name ist erforderlich' }
  if (!type) return { error: 'Typ ist erforderlich' }
  if (isNaN(originalAmount) || originalAmount <= 0)
    return { error: 'Betrag muss größer als 0 sein' }
  if (!currency) return { error: 'Währung ist erforderlich' }

  // outstanding defaults to original_amount at creation
  const outstandingRaw = formData.get('outstanding') as string
  const outstanding =
    outstandingRaw && !isNaN(parseFloat(outstandingRaw))
      ? parseFloat(outstandingRaw)
      : originalAmount

  const { error } = await supabase.from('debts').insert({
    name,
    type,
    original_amount: originalAmount,
    outstanding,
    currency,
    creditor: (formData.get('creditor') as string) || null,
    interest_rate: formData.get('interest_rate')
      ? parseFloat(formData.get('interest_rate') as string)
      : null,
    monthly_payment: formData.get('monthly_payment')
      ? parseFloat(formData.get('monthly_payment') as string)
      : null,
    due_date: (formData.get('due_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
    user_id: user.id,
  })

  if (error) return { error: error.message }
  revalidatePath('/finance/debts')
  return { success: true }
}

// ─── Update a debt entry ──────────────────────────────────────────────────────
export async function updateDebt(
  _prev: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id             = formData.get('id') as string
  const name           = (formData.get('name') as string)?.trim()
  const originalAmount = parseFloat(formData.get('original_amount') as string)
  const currency       = formData.get('currency') as string

  if (!id)   return { error: 'ID fehlt' }
  if (!name) return { error: 'Name ist erforderlich' }
  if (isNaN(originalAmount) || originalAmount <= 0)
    return { error: 'Betrag muss größer als 0 sein' }

  const outstandingRaw = formData.get('outstanding') as string
  const outstanding = outstandingRaw && !isNaN(parseFloat(outstandingRaw))
    ? parseFloat(outstandingRaw)
    : originalAmount

  const { error } = await supabase
    .from('debts')
    .update({
      name,
      original_amount: originalAmount,
      outstanding,
      currency,
      creditor:        (formData.get('creditor') as string) || null,
      interest_rate:   formData.get('interest_rate') ? parseFloat(formData.get('interest_rate') as string) : null,
      monthly_payment: formData.get('monthly_payment') ? parseFloat(formData.get('monthly_payment') as string) : null,
      due_date:        (formData.get('due_date') as string) || null,
      notes:           (formData.get('notes') as string) || null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/debts')
  return { success: true }
}

// ─── Delete a debt entry ──────────────────────────────────────────────────────
export async function deleteDebt(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('debts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/debts')
  return {}
}

// ─── Record a payment against a debt ─────────────────────────────────────────
export async function recordPayment(
  _prev: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const debtId = formData.get('debt_id') as string
  const paymentDate = formData.get('payment_date') as string
  const amount = parseFloat(formData.get('amount') as string)

  if (!debtId) return { error: 'Schuld-ID fehlt' }
  if (!paymentDate) return { error: 'Datum ist erforderlich' }
  if (isNaN(amount) || amount <= 0) return { error: 'Betrag muss größer als 0 sein' }

  // Fetch current outstanding to compute new balance
  const { data: debt, error: fetchError } = await supabase
    .from('debts')
    .select('outstanding')
    .eq('id', debtId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !debt) return { error: 'Schuld nicht gefunden' }

  const newOutstanding = Math.max(0, debt.outstanding - amount)

  // Insert payment record
  const { error: payError } = await supabase.from('debt_payments').insert({
    debt_id: debtId,
    payment_date: paymentDate,
    amount,
    principal: formData.get('principal')
      ? parseFloat(formData.get('principal') as string)
      : null,
    interest: formData.get('interest')
      ? parseFloat(formData.get('interest') as string)
      : null,
    notes: (formData.get('notes') as string) || null,
  })
  if (payError) return { error: payError.message }

  // Update outstanding balance (and deactivate if fully paid)
  const { error: updateError } = await supabase
    .from('debts')
    .update({
      outstanding: newOutstanding,
      is_active: newOutstanding > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', debtId)
    .eq('user_id', user.id)

  if (updateError) return { error: updateError.message }

  revalidatePath('/finance/debts')
  return { success: true }
}
