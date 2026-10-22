'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, reqDate, optText, optDate, optUuid, optIntField, moneyField, currency } from '@/lib/api/schemas'
import { CONTRACT_TYPES, FREQUENCIES } from '@/lib/finance/contract-constants'
import { AUSGEBLENDET_KEY, leseAusgeblendet } from '@/lib/data/vertragsvorschlaege'

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

// ─── Vorschläge aus den Buchungen ─────────────────────────────────────────────

const vorschlagSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(CONTRACT_TYPE_VALUES),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  amount: z.number().positive().max(1_000_000),
  billing_day: z.number().int().min(1).max(31).nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.uuid().nullable(),
  category_id: z.uuid().nullable(),
  notes: z.string().max(2000),
})

export type VorschlagEingabe = z.input<typeof vorschlagSchema>

/**
 * Legt einen Vertrag aus einem erkannten Muster an (ein Klick auf der Verträge-Seite). Die Werte kommen vom Client, werden hier aber
 * wie jede Formulareingabe geprüft; Konto und Kategorie müssen dem Nutzer gehören (RLS plus der Filter unten).
 */
export async function uebernehmeVertragsVorschlag(eingabe: VorschlagEingabe): Promise<{ error: string } | { success: true }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = vorschlagSchema.safeParse(eingabe)
  if (!p.success) return { error: 'Der Vorschlag ist ungültig.' }
  const v = p.data

  // Nicht zweimal anlegen: ein aktiver Vertrag gleichen Namens genügt.
  const { data: vorhanden } = await supabase.from('contracts').select('id').eq('user_id', user.id).eq('is_active', true).ilike('name', v.name).limit(1)
  if (vorhanden && vorhanden.length > 0) return { error: `Es gibt schon einen aktiven Vertrag „${v.name}".` }

  if (v.account_id) {
    const { data } = await supabase.from('accounts').select('id').eq('id', v.account_id).eq('user_id', user.id).maybeSingle()
    if (!data) return { error: 'Das Konto wurde nicht gefunden.' }
  }
  if (v.category_id) {
    const { data } = await supabase.from('categories').select('id').eq('id', v.category_id).eq('user_id', user.id).maybeSingle()
    if (!data) return { error: 'Die Kategorie wurde nicht gefunden.' }
  }

  const { error } = await supabase.from('contracts').insert({
    user_id: user.id, name: v.name, type: v.type, frequency: v.frequency, amount: v.amount, currency: 'EUR',
    billing_day: v.frequency === 'monthly' ? v.billing_day : null, start_date: v.start_date,
    account_id: v.account_id, category_id: v.category_id, notes: v.notes || null,
    // Kündigungsfrist ist unbekannt: 0 statt des Datenbank-Standards (30), sonst entstünden Kündigungswarnungen aus dem Nichts.
    auto_renews: true, notice_days: 0, is_active: true,
  })
  if (error) return { error: error.message }

  revalidatePath('/finance/contracts')
  revalidatePath('/finance/prognose')
  return { success: true }
}

/** Merkt sich, dass ein Vorschlag nicht mehr erscheinen soll (`user_settings.vertrags_vorschlaege_ausgeblendet`). */
export async function blendeVertragsVorschlagAus(schluessel: string): Promise<{ error: string } | { success: true }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  if (typeof schluessel !== 'string' || schluessel.length === 0 || schluessel.length > 200) return { error: 'Ungültiger Vorschlag.' }

  const { data } = await supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', AUSGEBLENDET_KEY).maybeSingle()
  const neu = [...new Set([...leseAusgeblendet(data?.value), schluessel])]
  const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key: AUSGEBLENDET_KEY, value: neu }, { onConflict: 'user_id,key' })
  if (error) return { error: error.message }
  revalidatePath('/finance/contracts')
  return { success: true }
}

export async function zeigeAusgeblendeteVorschlaegeWieder(): Promise<{ error: string } | { success: true }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key: AUSGEBLENDET_KEY, value: [] }, { onConflict: 'user_id,key' })
  if (error) return { error: error.message }
  revalidatePath('/finance/contracts')
  return { success: true }
}
