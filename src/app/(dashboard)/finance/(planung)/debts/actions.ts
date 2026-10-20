'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, reqDate, optText, optDate, optUuid, optMoneyField, moneyField, currency } from '@/lib/api/schemas'

export type DebtActionState = { error: string } | { success: true } | null

const positiveAmount = (msg: string) => moneyField(msg).refine(n => n > 0, msg)

const debtFields = {
  name: reqText('Name ist erforderlich', 200),
  type: reqEnum(['borrowed', 'lent'] as const, 'Typ ist erforderlich'),
  original_amount: positiveAmount('Betrag muss größer als 0 sein'),
  outstanding: optMoneyField('Offener Betrag ist ungültig'),
  currency,
  creditor: optText(200),
  interest_rate: optMoneyField('Zinssatz ist ungültig'),
  monthly_payment: optMoneyField('Monatsrate ist ungültig'),
  due_date: optDate,
  notes: optText(2000),
}
const createDebtSchema = z.object(debtFields)
const updateDebtSchema = z.object({ id: idField(), ...debtFields })

const recordPaymentSchema = z.object({
  debt_id: idField('Schuld-ID fehlt', 'Schuld-ID ist ungültig'),
  payment_date: reqDate(),
  amount: positiveAmount('Betrag muss größer als 0 sein'),
  principal: optMoneyField('Tilgung ist ungültig'),
  interest: optMoneyField('Zinsanteil ist ungültig'),
  notes: optText(2000),
  source_transaction_id: optUuid(),
  source_transaction_type: z.enum(['manual', 'bank_sync']).nullish().catch(null),
})

// ─── Create a new debt entry ──────────────────────────────────────────────────
export async function createDebt(
  _prev: DebtActionState,
  formData: FormData
): Promise<DebtActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createDebtSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const d = parsed.data

  const { error } = await supabase.from('debts').insert({
    name: d.name,
    type: d.type,
    original_amount: d.original_amount,
    // outstanding defaults to original_amount at creation
    outstanding: d.outstanding ?? d.original_amount,
    currency: d.currency,
    creditor: d.creditor,
    interest_rate: d.interest_rate,
    monthly_payment: d.monthly_payment,
    due_date: d.due_date,
    notes: d.notes,
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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateDebtSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...d } = parsed.data

  const { error } = await supabase
    .from('debts')
    .update({
      name: d.name,
      type: d.type,
      original_amount: d.original_amount,
      outstanding: d.outstanding ?? d.original_amount,
      currency: d.currency,
      creditor: d.creditor,
      interest_rate: d.interest_rate,
      monthly_payment: d.monthly_payment,
      due_date: d.due_date,
      notes: d.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/debts')
  return { success: true }
}

// ─── Delete a debt entry ──────────────────────────────────────────────────────
export async function deleteDebt(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, recordPaymentSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { debt_id: debtId, payment_date: paymentDate, amount } = parsed.data

  // Fetch current outstanding to compute new balance
  const { data: debt, error: fetchError } = await supabase
    .from('debts')
    .select('outstanding')
    .eq('id', debtId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !debt) return { error: 'Schuld nicht gefunden' }

  const newOutstanding = Math.max(0, debt.outstanding - amount)

  // Optionale Verknuepfung zur Buchung, aus der dieser Vorschlag entstand (siehe
  // DebtSuggestion) -- manuelle und bank-synchte Buchungen leben in getrennten Tabellen,
  // daher zwei Spalten statt einer. Der Unique-Index auf beiden verhindert, dieselbe
  // Buchung zweimal als Zahlung zu verbuchen.
  const sourceTransactionId = parsed.data.source_transaction_id
  const sourceType = parsed.data.source_transaction_type

  const { error: payError } = await supabase.from('debt_payments').insert({
    debt_id: debtId,
    payment_date: paymentDate,
    amount,
    principal: parsed.data.principal,
    interest: parsed.data.interest,
    notes: parsed.data.notes,
    transaction_id: sourceTransactionId && sourceType === 'manual' ? sourceTransactionId : null,
    bank_transaction_id: sourceTransactionId && sourceType === 'bank_sync' ? sourceTransactionId : null,
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
