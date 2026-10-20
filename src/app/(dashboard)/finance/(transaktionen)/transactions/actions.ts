'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, optUuid, optText as optTextShared, moneyField, reqDate, currency as currencySchema, boolTrue } from '@/lib/api/schemas'

// Leere Formularfelder kommen als '' an -> für optionale Felder zu null normalisieren.
const optText = (max: number) =>
  z.string().max(max).optional().transform(v => v?.trim() || null)

const createTransactionSchema = z.object({
  date: z.string().min(1, 'Datum ist erforderlich').regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum ist ungültig'),
  account_id: z.string().min(1, 'Konto ist erforderlich'),
  amount: z.string().trim().min(1, 'Betrag ist ungültig').refine(v => Number.isFinite(Number(v)), 'Betrag ist ungültig'),
  currency: z.string().min(1, 'Währung ist erforderlich').max(10),
  is_transfer: z.string().optional(),
  transfer_to: optText(64),
  category_id: optText(64),
  description: optText(500),
  merchant: optText(200),
})

const updateTransactionSchema = z.object({
  id: idField(),
  date: reqDate(),
  account_id: z.string({ error: 'Konto ist erforderlich' }).min(1, 'Konto ist erforderlich').pipe(uuid),
  amount: moneyField(),
  currency: currencySchema,
  is_transfer: boolTrue,
  transfer_to: optUuid(),
  category_id: optUuid(),
  description: optTextShared(500),
  merchant: optTextShared(200),
})

export type TransactionActionState = { error: string } | { success: true; id?: string } | null

export async function createTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const { supabase, user } = await getAuthUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createTransactionSchema)
  if (!parsed.ok) return { error: parsed.issues[0]?.message ?? parsed.error }
  const { date, account_id, amount: amountRaw, currency, description, merchant, category_id } = parsed.data
  const isTransfer = parsed.data.is_transfer === 'true'
  const transferTo = parsed.data.transfer_to

  const type = isTransfer ? 'transfer' : (parseFloat(amountRaw) >= 0 ? 'income' : 'expense')
  const amount = Math.abs(parseFloat(amountRaw))

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date,
      type,
      account_id,
      currency,
      amount,
      transfer_to: isTransfer ? transferTo : null,
      category_id,
      description,
      merchant,
      user_id: user.id,
      fx_rate: 1,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/finance/transactions')
  // Die ID geht an den Aufrufer zurueck, damit z.B. der Schulden-Vorschlag (DebtSuggestion)
  // die frisch gespeicherte Buchung verknuepfen kann -- vor dem Speichern existiert noch
  // keine ID, auf die eine Zahlung zeigen koennte.
  return { success: true, id: data?.id }
}

export async function updateTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateTransactionSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, date, account_id, amount: amountNum, currency, category_id, description, merchant } = parsed.data
  const isTransfer = parsed.data.is_transfer
  const transferTo = parsed.data.transfer_to

  const type = isTransfer ? 'transfer' : (amountNum >= 0 ? 'income' : 'expense')
  const amount = Math.abs(amountNum)

  const { error } = await supabase
    .from('transactions')
    .update({
      date,
      type,
      account_id,
      currency,
      amount,
      transfer_to: isTransfer ? transferTo : null,
      category_id,
      description,
      merchant,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/finance/transactions')
  return { success: true }
}

// Lean, single-column update for the inline category Select in the transactions table — the
// full `updateTransaction` action needs every field (date/account/amount/...), which is
// pointless round-trip weight for a change that's visually just "pick a category". `source`
// picks the right underlying table: bank-synced rows in the unified view are really
// `bank_transactions` rows (see the `unified_transactions` view, migration 20260821010000),
// not `transactions`.
const updateCategoryArgs = z.object({
  id: uuid,
  categoryId: uuid.nullable(),
  source: z.enum(['manual', 'bank_sync']),
})

export async function updateTransactionCategory(
  id: string,
  categoryId: string | null,
  source: 'manual' | 'bank_sync',
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const p = parseInput(updateCategoryArgs, { id, categoryId, source })
  if (!p.ok) return { error: issueMessage(p) }

  const table = source === 'bank_sync' ? 'bank_transactions' : 'transactions'
  const { error } = await supabase
    .from(table)
    .update({ category_id: categoryId })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  // Beide Seiten neu rendern: dieselbe Select steckt auch in der Buchungstabelle der
  // Kontodetailseite. Ohne den zweiten Aufruf zeigte die dort nach einer Änderung auf
  // /finance/transactions noch die alte Kategorie — samt der daraus gerechneten
  // „Größte Ausgaben nach Kategorie".
  revalidatePath('/finance/transactions')
  revalidatePath('/finance/accounts/[id]', 'page')
  return {}
}

export async function deleteTransaction(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(uuid, id)
  if (!p.ok) return { error: issueMessage(p) }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/transactions')
  return {}
}
