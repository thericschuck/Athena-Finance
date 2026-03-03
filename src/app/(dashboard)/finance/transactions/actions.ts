'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TransactionActionState = { error: string } | { success: true } | null

export async function createTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const date = formData.get('date') as string
  const type = formData.get('type') as string
  const account_id = formData.get('account_id') as string
  const amountRaw = formData.get('amount') as string
  const currency = formData.get('currency') as string

  if (!date) return { error: 'Datum ist erforderlich' }
  if (!type) return { error: 'Typ ist erforderlich' }
  if (!account_id) return { error: 'Konto ist erforderlich' }
  if (!amountRaw || isNaN(Number(amountRaw))) return { error: 'Betrag ist ungültig' }
  if (!currency) return { error: 'Währung ist erforderlich' }

  const amount = Math.abs(parseFloat(amountRaw))

  const { error } = await supabase.from('transactions').insert({
    date,
    type,
    account_id,
    currency,
    amount,
    category_id: (formData.get('category_id') as string) || null,
    description: (formData.get('description') as string) || null,
    merchant: (formData.get('merchant') as string) || null,
    user_id: user.id,
    fx_rate: 1,
  })

  if (error) return { error: error.message }

  revalidatePath('/finance/transactions')
  return { success: true }
}
