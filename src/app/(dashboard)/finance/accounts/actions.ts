'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, optText, boolTrue, currency } from '@/lib/api/schemas'

export type AccountActionState = { error: string } | { success: true } | null

// Typen laut Check-Constraint (fix_accounts_type_check.sql).
const ACCOUNT_TYPES = ['checking', 'savings', 'building_savings', 'investment', 'crypto', 'cash', 'credit', 'other'] as const

const accountFields = {
  name: reqText('Name ist erforderlich', 100),
  type: reqEnum(ACCOUNT_TYPES, 'Typ ist erforderlich'),
  currency,
  institution: optText(200),
  color: optText(32),
  iban: optText(40),
}
const createAccountSchema = z.object(accountFields)
const updateAccountSchema = z.object({ id: idField(), ...accountFields, is_active: boolTrue })

export async function createAccount(
  _prev: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const { supabase, user } = await getAuthUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createAccountSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('accounts').insert({
    ...parsed.data,
    user_id: user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/finance/accounts')
  return { success: true }
}

export async function updateAccount(
  _prev: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateAccountSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from('accounts')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/accounts')
  return { success: true }
}

export async function deleteAccount(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/accounts')
  return {}
}
