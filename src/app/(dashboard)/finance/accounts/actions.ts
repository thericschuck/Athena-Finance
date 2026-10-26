'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, optText, boolTrue, currency, MAX_AMOUNT } from '@/lib/api/schemas'
import { ANPASSUNG_BESCHREIBUNG, nachkommastellen, saldoAnpassung } from '@/lib/konten/berechnen'

export type AccountActionState = { error: string } | { success: true } | null

// Typen laut Check-Constraint (fix_accounts_type_check.sql).
const ACCOUNT_TYPES = ['checking', 'savings', 'building_savings', 'investment', 'crypto', 'cash', 'credit', 'other'] as const

// IBAN: Leerzeichen raus, Großbuchstaben, grobe Formprüfung (Länderkürzel, Prüfziffern, Rest).
const ibanField = z
  .string()
  .max(60)
  .optional()
  .transform((v) => (v ?? '').replace(/\s+/g, '').toUpperCase() || null)
  // Das Feld trägt auch Kontonummern („478881916“) und Vertragsnummern („21499214V01/V02“): nur wer wie
  // eine IBAN beginnt (Länderkürzel + 2 Ziffern), wird als IBAN geprüft.
  .refine(
    (v) =>
      v === null ||
      (/^[A-Z]{2}\d{2}/.test(v) ? /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v) : /^[A-Z0-9/._-]{1,40}$/.test(v)),
    'IBAN bzw. Kontonummer ist ungültig',
  )

const accountFields = {
  name: reqText('Name ist erforderlich', 100),
  type: reqEnum(ACCOUNT_TYPES, 'Typ ist erforderlich'),
  currency,
  institution: optText(200),
  color: optText(32),
  iban: ibanField,
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
  revalidatePath('/dashboard')
  revalidatePath('/analyse')
  return {}
}

/** Heutiges Datum in Berliner Zeit (YYYY-MM-DD), nie `toISOString()` (UTC verschiebt den Tag). */
function heuteBerlinIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

const saldoSchema = z.object({
  kontoId: uuid,
  ziel: z.number({ error: 'Saldo ist ungültig' }).min(-MAX_AMOUNT, 'Saldo ist ungültig').max(MAX_AMOUNT, 'Saldo ist ungültig'),
})

/**
 * Setzt den Saldo eines MANUELLEN Kontos (ohne bank_iban) auf `ziel`: bucht die Differenz als
 * „Alter Kontostand – Anpassung“ (zählt weder als Einnahme noch als Ausgabe).
 */
export async function setzeManuellenSaldo(
  kontoId: string,
  ziel: number,
): Promise<{ error?: string; angepasst?: boolean }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsed = parseInput(saldoSchema, { kontoId, ziel })
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { data: konto } = await supabase
    .from('accounts')
    .select('id, currency, bank_iban, is_active')
    .eq('id', parsed.data.kontoId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!konto) return { error: 'Konto nicht gefunden' }
  if (konto.bank_iban) return { error: 'Der Saldo eines Bankkontos kommt von der Bank und lässt sich nicht setzen.' }
  if (!konto.is_active) return { error: 'Das Konto ist inaktiv.' }

  const { data: summe, error: leseFehler } = await supabase
    .from('account_balance_sums_manual')
    .select('balance')
    .eq('account_id', konto.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (leseFehler) return { error: leseFehler.message }

  // Basis ist die Summe der manuellen Buchungen (wie die Liste sie anzeigt). Der nächtliche Snapshot
  // (fn_recompute_account_balances) rechnet Umbuchungen und das Datum anders — solange es auf einem
  // manuellen Konto weder Umbuchungen noch Buchungen mit Zukunftsdatum gibt, ist das identisch.
  const buchung = saldoAnpassung(Number(summe?.balance ?? 0), parsed.data.ziel, nachkommastellen(konto.currency))
  if (!buchung) return { angepasst: false }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: konto.id,
    type: buchung.type,
    amount: buchung.amount,
    currency: konto.currency,
    description: ANPASSUNG_BESCHREIBUNG,
    date: heuteBerlinIso(),
    category_id: null,
  })
  if (error) return { error: error.message }

  revalidatePath('/finance/accounts')
  revalidatePath(`/finance/accounts/${konto.id}`)
  revalidatePath('/dashboard')
  revalidatePath('/analyse')
  return { angepasst: true }
}

const sortSchema = z.array(uuid).max(100, 'Zu viele Konten')

/** Speichert die Anzeigereihenfolge: `sort_order` = Index in `ids` (nur eigene Konten). */
export async function sortiereKonten(ids: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsed = parseInput(sortSchema, ids)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  if (new Set(parsed.data).size !== parsed.data.length) return { error: 'Doppelte Konten' }

  const ergebnisse = await Promise.all(
    parsed.data.map((id, index) =>
      supabase.from('accounts').update({ sort_order: index }).eq('id', id).eq('user_id', user.id),
    ),
  )
  const fehler = ergebnisse.find((r) => r.error)?.error
  if (fehler) return { error: fehler.message }

  revalidatePath('/finance/accounts')
  revalidatePath('/dashboard')
  return {}
}
