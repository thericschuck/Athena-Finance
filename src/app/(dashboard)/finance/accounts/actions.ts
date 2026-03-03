'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AccountActionState = { error: string } | { success: true } | null

export async function createAccount(
  _prev: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const currency = formData.get('currency') as string

  if (!name?.trim()) return { error: 'Name ist erforderlich' }
  if (!type) return { error: 'Typ ist erforderlich' }
  if (!currency) return { error: 'Währung ist erforderlich' }

  const { error } = await supabase.from('accounts').insert({
    name: name.trim(),
    type,
    currency,
    institution: (formData.get('institution') as string) || null,
    color: (formData.get('color') as string) || null,
    iban: (formData.get('iban') as string) || null,
    user_id: user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/finance/accounts')
  return { success: true }
}
