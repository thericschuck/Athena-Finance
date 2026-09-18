'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TransactionActionState = { error: string } | { success: true; id?: string } | null

export async function createTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const { supabase, user } = await getAuthUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const date = formData.get('date') as string
  const account_id = formData.get('account_id') as string
  const amountRaw = formData.get('amount') as string
  const currency = formData.get('currency') as string
  const isTransfer = formData.get('is_transfer') === 'true'
  const transferTo = (formData.get('transfer_to') as string) || null

  if (!date) return { error: 'Datum ist erforderlich' }
  if (!account_id) return { error: 'Konto ist erforderlich' }
  if (!amountRaw || isNaN(Number(amountRaw))) return { error: 'Betrag ist ungültig' }
  if (!currency) return { error: 'Währung ist erforderlich' }

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
      category_id: (formData.get('category_id') as string) || null,
      description: (formData.get('description') as string) || null,
      merchant: (formData.get('merchant') as string) || null,
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

  const id        = formData.get('id') as string
  const date      = formData.get('date') as string
  const account_id = formData.get('account_id') as string
  const amountRaw = formData.get('amount') as string
  const currency  = formData.get('currency') as string
  const isTransfer = formData.get('is_transfer') === 'true'
  const transferTo = (formData.get('transfer_to') as string) || null

  if (!id)                                      return { error: 'ID fehlt' }
  if (!date)                                    return { error: 'Datum ist erforderlich' }
  if (!account_id)                              return { error: 'Konto ist erforderlich' }
  if (!amountRaw || isNaN(Number(amountRaw)))   return { error: 'Betrag ist ungültig' }
  if (!currency)                                return { error: 'Währung ist erforderlich' }

  const type = isTransfer ? 'transfer' : (parseFloat(amountRaw) >= 0 ? 'income' : 'expense')
  const amount = Math.abs(parseFloat(amountRaw))

  const { error } = await supabase
    .from('transactions')
    .update({
      date,
      type,
      account_id,
      currency,
      amount,
      transfer_to: isTransfer ? transferTo : null,
      category_id: (formData.get('category_id') as string) || null,
      description: (formData.get('description') as string) || null,
      merchant:    (formData.get('merchant') as string) || null,
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
export async function updateTransactionCategory(
  id: string,
  categoryId: string | null,
  source: 'manual' | 'bank_sync',
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

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

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/transactions')
  return {}
}
