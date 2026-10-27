'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, reqDate, optText, optDate, optUuid, optMoneyField, moneyField, currency } from '@/lib/api/schemas'
import { pruefeZahlung, restNachLoeschen, restNachZahlung, zahlungsAnteile, rund2 } from '@/lib/schulden/berechnen'
import { requireRows } from '@/lib/data/mutation'
import { setzeGeteilt } from '@/lib/haushalt/teilen'

export type DebtActionState = { error: string } | { success: true } | null

// Betragsregel: Der Browser liest die Eingabe mit betragAusNutzereingabe (deutsche Schreibweise) und
// schickt den kanonischen Wert (Punkt als Dezimaltrenner); hier wird er nur noch geprüft.
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

type Felder = {
  original_amount: number
  outstanding: number | null
  interest_rate: number | null
  monthly_payment: number | null
}

/** Gemeinsame Plausibilität für Anlegen und Bearbeiten. */
function pruefeSchuld(d: Felder): string | null {
  if (d.outstanding != null && d.outstanding < 0) return 'Offener Betrag darf nicht negativ sein'
  if (d.outstanding != null && d.outstanding > d.original_amount) return 'Offener Betrag darf den Gesamtbetrag nicht übersteigen'
  if (d.interest_rate != null && (d.interest_rate < 0 || d.interest_rate > 100)) return 'Zinssatz muss zwischen 0 und 100 liegen'
  if (d.monthly_payment != null && d.monthly_payment < 0) return 'Monatsrate darf nicht negativ sein'
  return null
}

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
  const fehler = pruefeSchuld(d)
  if (fehler) return { error: fehler }

  const outstanding = d.outstanding ?? d.original_amount
  const { data: neu, error } = await supabase.from('debts').insert({
    name: d.name,
    type: d.type,
    original_amount: d.original_amount,
    // outstanding defaults to original_amount at creation
    outstanding,
    is_active: outstanding > 0,
    currency: d.currency,
    creditor: d.creditor,
    interest_rate: d.interest_rate,
    monthly_payment: d.monthly_payment,
    due_date: d.due_date,
    notes: d.notes,
    user_id: user.id,
  }).select('id').single()

  if (error) return { error: error.message }
  const teilFehler = await setzeGeteilt(supabase, 'debts', neu.id, user.id, formData)
  if (teilFehler) return { error: teilFehler }
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
  const fehler = pruefeSchuld(d)
  if (fehler) return { error: fehler }

  // Bisherigen Stand lesen: ein leeres Feld „Ausstehend“ lässt die Restschuld unverändert (früher
  // wurde sie dabei auf den Gesamtbetrag zurückgesetzt und getilgte Schulden wieder offen).
  const { data: alt } = await supabase
    .from('debts')
    .select('outstanding')
    .eq('id', id)
    .maybeSingle()
  if (!alt) return { error: 'Schuld nicht gefunden' }

  const outstanding = Math.min(d.outstanding ?? Number(alt.outstanding), d.original_amount)

  const { error } = await requireRows(supabase
    .from('debts')
    .update({
      name: d.name,
      type: d.type,
      original_amount: d.original_amount,
      outstanding,
      is_active: outstanding > 0,
      currency: d.currency,
      creditor: d.creditor,
      interest_rate: d.interest_rate,
      monthly_payment: d.monthly_payment,
      due_date: d.due_date,
      notes: d.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id))

  if (error) return { error: error.message }
  const teilFehler = await setzeGeteilt(supabase, 'debts', id, user.id, formData)
  if (teilFehler) return { error: teilFehler }
  revalidatePath('/finance/debts')
  return { success: true }
}

// ─── Delete a debt entry ──────────────────────────────────────────────────────
export async function deleteDebt(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await requireRows(supabase
    .from('debts')
    .delete()
    .eq('id', id))

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

  // Besitzprüfung: nur eigene Schulden
  const { data: debt, error: fetchError } = await supabase
    .from('debts')
    .select('outstanding, is_active')
    .eq('id', debtId)
    .single()

  if (fetchError || !debt) return { error: 'Schuld nicht gefunden' }
  if (!debt.is_active) return { error: 'Diese Schuld ist bereits abgeschlossen' }

  const outstanding = Number(debt.outstanding)
  const eingabe = { amount, principal: parsed.data.principal, interest: parsed.data.interest }
  const fehler = pruefeZahlung(eingabe, outstanding)
  if (fehler) return { error: fehler }
  const { tilgung, zinsen } = zahlungsAnteile(eingabe)
  const hatAnteile = eingabe.principal != null || eingabe.interest != null
  const newOutstanding = restNachZahlung(outstanding, eingabe)

  // Optionale Verknuepfung zur Buchung, aus der dieser Vorschlag entstand (siehe
  // DebtSuggestion) -- manuelle und bank-synchte Buchungen leben in getrennten Tabellen,
  // daher zwei Spalten statt einer. Der Unique-Index auf beiden verhindert, dieselbe
  // Buchung zweimal als Zahlung zu verbuchen.
  const sourceTransactionId = parsed.data.source_transaction_id
  const sourceType = parsed.data.source_transaction_type
  if (sourceTransactionId && sourceType) {
    // Besitzprüfung der Quellbuchung: sonst ließe sich eine fremde Buchungs-ID verknüpfen.
    const { data: quelle } = await supabase
      .from(sourceType === 'manual' ? 'transactions' : 'bank_transactions')
      .select('id')
      .eq('id', sourceTransactionId)
      .maybeSingle()
    if (!quelle) return { error: 'Verknüpfte Buchung nicht gefunden' }
  }

  const { data: neu, error: payError } = await supabase
    .from('debt_payments')
    .insert({
      debt_id: debtId,
      payment_date: paymentDate,
      amount,
      principal: hatAnteile ? tilgung : null,
      interest: hatAnteile ? zinsen : null,
      notes: parsed.data.notes,
      transaction_id: sourceTransactionId && sourceType === 'manual' ? sourceTransactionId : null,
      bank_transaction_id: sourceTransactionId && sourceType === 'bank_sync' ? sourceTransactionId : null,
    })
    .select('id')
    .single()
  if (payError || !neu) {
    return { error: payError?.code === '23505' ? 'Diese Buchung ist bereits als Zahlung verbucht' : (payError?.message ?? 'Zahlung konnte nicht gespeichert werden') }
  }

  // Restschuld nur setzen, wenn sie sich seit dem Lesen nicht geändert hat (zwei Zahlungen gleichzeitig).
  const { data: geaendert, error: updateError } = await supabase
    .from('debts')
    .update({
      outstanding: newOutstanding,
      is_active: newOutstanding > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', debtId)
    .eq('outstanding', outstanding)
    .select('id')

  if (updateError || !geaendert || geaendert.length === 0) {
    // Zahlung zurücknehmen, damit Zahlungen und Restschuld nicht auseinanderlaufen.
    await supabase.from('debt_payments').delete().eq('id', neu.id)
    return { error: updateError?.message ?? 'Die Schuld wurde zwischenzeitlich geändert. Bitte erneut versuchen.' }
  }

  revalidatePath('/finance/debts')
  return { success: true }
}

// ─── Delete a payment (Korrektur): Tilgung kommt zur Restschuld zurück ───────
export async function deletePayment(paymentId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, paymentId)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data: zahlung } = await supabase
    .from('debt_payments')
    .select('id, debt_id, amount, principal, interest')
    .eq('id', paymentId)
    .maybeSingle()
  if (!zahlung) return { error: 'Zahlung nicht gefunden' }

  // Besitzprüfung über die Schuld
  const { data: debt } = await supabase
    .from('debts')
    .select('outstanding, original_amount')
    .eq('id', zahlung.debt_id)
    .maybeSingle()
  if (!debt) return { error: 'Zahlung nicht gefunden' }

  const outstanding = Number(debt.outstanding)
  const neu = restNachLoeschen(outstanding, Number(debt.original_amount), {
    amount: Number(zahlung.amount),
    principal: zahlung.principal == null ? null : Number(zahlung.principal),
    interest: zahlung.interest == null ? null : Number(zahlung.interest),
  })

  const { data: geaendert, error: updateError } = await supabase
    .from('debts')
    .update({ outstanding: neu, is_active: neu > 0, updated_at: new Date().toISOString() })
    .eq('id', zahlung.debt_id)
    .eq('outstanding', outstanding)
    .select('id')
  if (updateError || !geaendert || geaendert.length === 0) {
    return { error: updateError?.message ?? 'Die Schuld wurde zwischenzeitlich geändert. Bitte erneut versuchen.' }
  }

  const { error: delError } = await requireRows(supabase.from('debt_payments').delete().eq('id', paymentId))
  if (delError) {
    // Restschuld zurücksetzen, die Zahlung bleibt ja bestehen.
    await supabase.from('debts').update({ outstanding: rund2(outstanding), is_active: outstanding > 0 }).eq('id', zahlung.debt_id)
    return { error: delError.message }
  }

  revalidatePath('/finance/debts')
  return {}
}
