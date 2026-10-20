'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, reqDate, optText, optDate, optUuid, optIntField, moneyField, currency } from '@/lib/api/schemas'
import { CONTRACT_TYPES, FREQUENCIES } from '@/lib/finance/contract-constants'

export type ContractActionState = { error: string } | { success: true } | null

const CONTRACT_TYPE_VALUES = CONTRACT_TYPES.map(t => t.value) as [string, ...string[]]
const FREQUENCY_VALUES = FREQUENCIES.map(f => f.value) as [string, ...string[]]

const contractSchema = z.object({
  name: reqText('Name ist erforderlich', 200),
  type: reqEnum(CONTRACT_TYPE_VALUES as [string, ...string[]], 'Typ ist erforderlich'),
  frequency: reqEnum(FREQUENCY_VALUES as [string, ...string[]], 'Intervall ist erforderlich'),
  currency,
  amount: moneyField('Betrag muss größer als 0 sein').refine(n => n > 0, 'Betrag muss größer als 0 sein'),
  start_date: reqDate('Startdatum ist erforderlich'),
  provider: optText(200),
  end_date: optDate,
  notice_days: optIntField('Kündigungsfrist ist ungültig').transform(v => v ?? 0),
  billing_day: optIntField('Abrechnungstag ist ungültig'),
  auto_renews: z.string().optional().transform(v => v === 'on'),
  account_id: optUuid(),
  to_account_id: optUuid(),
  category_id: optUuid(),
  notes: optText(2000),
})

function buildPayload(formData: FormData, userId: string):
  | { ok: true; payload: z.infer<typeof contractSchema> & { user_id: string } }
  | { ok: false; error: string } {
  const p = parseForm(formData, contractSchema)
  if (!p.ok) return { ok: false, error: issueMessage(p) }
  return { ok: true, payload: { ...p.data, user_id: userId } }
}

export async function createContract(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const built = buildPayload(formData, user.id)
  if (!built.ok) return { error: built.error }

  const { error } = await supabase.from('contracts').insert(built.payload)
  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  return { success: true }
}

export async function updateContract(
  _prev: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const idP = parseInput(idField(), formData.get('id'))
  if (!idP.ok) return { error: issueMessage(idP) }
  const id = idP.data

  const built = buildPayload(formData, user.id)
  if (!built.ok) return { error: built.error }
  const { user_id: _uid, ...updates } = built.payload

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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(uuid, id)
  if (!p.ok) return { error: issueMessage(p) }

  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  return {}
}
