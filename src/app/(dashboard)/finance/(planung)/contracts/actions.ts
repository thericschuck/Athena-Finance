'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ContractActionState = { error: string } | { success: true } | null

function parseOptionalFloat(val: FormDataEntryValue | null): number | null {
  if (!val || val === '') return null
  const n = parseFloat(val as string)
  return isNaN(n) ? null : n
}

function parseOptionalInt(val: FormDataEntryValue | null): number | null {
  if (!val || val === '') return null
  const n = parseInt(val as string, 10)
  return isNaN(n) ? null : n
}

function buildPayload(formData: FormData, userId: string) {
  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  const frequency = formData.get('frequency') as string
  const currency = formData.get('currency') as string
  const amount = parseFloat(formData.get('amount') as string)
  const start_date = formData.get('start_date') as string

  return {
    name,
    type,
    frequency,
    currency,
    amount,
    start_date,
    provider: (formData.get('provider') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
    notice_days: parseOptionalInt(formData.get('notice_days')) ?? 0,
    billing_day: parseOptionalInt(formData.get('billing_day')),
    auto_renews: formData.get('auto_renews') === 'on',
    account_id:    (formData.get('account_id')    as string) || null,
    to_account_id: (formData.get('to_account_id') as string) || null,
    category_id:   (formData.get('category_id')   as string) || null,
    notes:         (formData.get('notes')          as string) || null,
    user_id: userId,
  }
}

function validate(payload: ReturnType<typeof buildPayload>): string | null {
  if (!payload.name) return 'Name ist erforderlich'
  if (!payload.type) return 'Typ ist erforderlich'
  if (!payload.frequency) return 'Intervall ist erforderlich'
  if (!payload.currency) return 'Währung ist erforderlich'
  if (isNaN(payload.amount) || payload.amount <= 0) return 'Betrag muss größer als 0 sein'
  if (!payload.start_date) return 'Startdatum ist erforderlich'
  return null
}

export async function createContract(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const payload = buildPayload(formData, user.id)
  const err = validate(payload)
  if (err) return { error: err }

  const { error } = await supabase.from('contracts').insert(payload)
  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  return { success: true }
}

export async function updateContract(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id = formData.get('id') as string
  if (!id) return { error: 'ID fehlt' }

  const { user_id: _uid, ...updates } = buildPayload(formData, user.id)
  const err = validate({ ...updates, user_id: user.id })
  if (err) return { error: err }

  const { error } = await supabase
    .from('contracts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  return { success: true }
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  return {}
}
