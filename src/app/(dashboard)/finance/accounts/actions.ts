'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, optText, boolTrue, currency, MAX_AMOUNT } from '@/lib/api/schemas'
import { ANPASSUNG_BESCHREIBUNG, nachkommastellen, saldoAnpassung } from '@/lib/konten/berechnen'
import { requireRows } from '@/lib/data/mutation'
import { setzeGeteilt } from '@/lib/haushalt/teilen'

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

  const { data: neu, error } = await supabase.from('accounts').insert({
    ...parsed.data,
    user_id: user.id,
  }).select('id').single()

  if (error) return { error: error.message }
  const teilFehler = await setzeGeteilt(supabase, 'accounts', neu.id, user.id, formData)
  if (teilFehler) return { error: teilFehler }

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

  const { error } = await requireRows(supabase
    .from('accounts')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id))

  if (error) return { error: error.message }
  const teilFehler = await setzeGeteilt(supabase, 'accounts', id, user.id, formData)
  if (teilFehler) return { error: teilFehler }
  revalidatePath('/finance/accounts')
  return { success: true }
}

export async function deleteAccount(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await requireRows(supabase
    .from('accounts')
    .delete()
    .eq('id', id))

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
    .maybeSingle()
  if (!konto) return { error: 'Konto nicht gefunden' }
  if (konto.bank_iban) return { error: 'Der Saldo eines Bankkontos kommt von der Bank und lässt sich nicht setzen.' }
  if (!konto.is_active) return { error: 'Das Konto ist inaktiv.' }

  // Die View gruppiert nach (user_id, account_id): im Haushalt kann es je Konto mehrere Zeilen geben (Buchungen beider
  // Mitglieder) — summieren statt maybeSingle.
  const { data: summenZeilen, error: leseFehler } = await supabase
    .from('account_balance_sums_manual')
    .select('balance')
    .eq('account_id', konto.id)
  if (leseFehler) return { error: leseFehler.message }

  // Basis ist die Summe der manuellen Buchungen (wie die Liste sie anzeigt). Der nächtliche Snapshot
  // (fn_recompute_account_balances) rechnet Umbuchungen und das Datum anders — solange es auf einem
  // manuellen Konto weder Umbuchungen noch Buchungen mit Zukunftsdatum gibt, ist das identisch.
  const buchung = saldoAnpassung((summenZeilen ?? []).reduce((a, z) => a + Number(z.balance ?? 0), 0), parsed.data.ziel, nachkommastellen(konto.currency))
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

/** Beschreibung der Ausgleichsbuchung — beginnt mit „Alter Kontostand“, damit sie als Anfangsbestand zählt. */
const AUSGLEICH_BESCHREIBUNG = 'Alter Kontostand – Anfangsbestand ergänzt'

/** Einen Tag vor `iso` (YYYY-MM-DD), kalendarisch, ohne Zeitzonen-Rechnung. */
function tagDavor(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const ausgleichSchema = z.object({ kontoId: uuid })

/**
 * Gleicht die Abweichung eines BANKKONTOS aus: Bank-Saldo und Summe aller Buchungen passen nicht
 * zusammen, weil FinTS nur ein Zeitfenster liefert und der Saldo davor nirgends steht. Gebucht wird
 * der fehlende Betrag als „Alter Kontostand – Anfangsbestand ergänzt“ einen Tag VOR der ersten Buchung.
 *
 * Das ändert weder Einnahmen/Ausgaben (Anfangsbestände zählen nicht als Fluss) noch den Verlauf (der ist
 * am Bank-Saldo verankert, siehe fn_recompute_account_balances) — danach stimmt nur die Summe der
 * Buchungen wieder mit dem Konto überein. Kommt die Bank später doch mit älteren Buchungen (voller
 * Verlauf), taucht die Abweichung mit umgekehrtem Vorzeichen wieder auf und lässt sich erneut ausgleichen.
 */
export async function gleicheAbweichungAus(
  kontoId: string,
): Promise<{ error?: string; ausgeglichen?: boolean; betrag?: number; datum?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsed = parseInput(ausgleichSchema, { kontoId })
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { data: konto } = await supabase
    .from('accounts')
    .select('id, currency, bank_iban')
    .eq('id', parsed.data.kontoId)
    .maybeSingle()
  if (!konto) return { error: 'Konto nicht gefunden' }
  if (!konto.bank_iban) return { error: 'Nur für Bankkonten. Bei manuellen Konten gibt es „Saldo setzen“.' }

  // Haushaltsdaten: kein user_id-Filter (RLS). Die Summen-View hat je Buchungs-Nutzer eine Zeile -> summieren.
  const [{ data: bank }, { data: summenZeilen }, { data: erste }] = await Promise.all([
    supabase
      .from('bank_balance')
      .select('booked_balance')
      .eq('account_iban', konto.bank_iban)
      .maybeSingle(),
    supabase
      .from('account_balance_sums_unified')
      .select('balance')
      .eq('account_id', konto.id),
    supabase
      .from('unified_transactions')
      .select('date')
      .eq('account_id', konto.id)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  if (!bank) return { error: 'Für dieses Konto liegt kein Bank-Saldo vor (noch kein Sync).' }

  const diff = Math.round((Number(bank.booked_balance) - (summenZeilen ?? []).reduce((a, z) => a + Number(z.balance ?? 0), 0)) * 100) / 100
  if (diff === 0) return { ausgeglichen: false }

  const datum = erste?.date ? tagDavor(erste.date) : heuteBerlinIso()
  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: konto.id,
    type: diff > 0 ? 'income' : 'expense',
    amount: Math.abs(diff),
    currency: konto.currency,
    description: AUSGLEICH_BESCHREIBUNG,
    date: datum,
    category_id: null,
  })
  if (error) return { error: error.message }

  revalidatePath('/finance/accounts')
  revalidatePath(`/finance/accounts/${konto.id}`)
  revalidatePath('/dashboard')
  revalidatePath('/analyse')
  return { ausgeglichen: true, betrag: diff, datum }
}

const sortSchema = z.array(uuid).max(100, 'Zu viele Konten')

/** Speichert die Anzeigereihenfolge: `sort_order` = Index in `ids` (Haushaltskonten, RLS). */
export async function sortiereKonten(ids: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsed = parseInput(sortSchema, ids)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  if (new Set(parsed.data).size !== parsed.data.length) return { error: 'Doppelte Konten' }

  const ergebnisse = await Promise.all(
    parsed.data.map((id, index) =>
      supabase.from('accounts').update({ sort_order: index }).eq('id', id),
    ),
  )
  const fehler = ergebnisse.find((r) => r.error)?.error
  if (fehler) return { error: fehler.message }

  revalidatePath('/finance/accounts')
  revalidatePath('/dashboard')
  return {}
}
