'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CategoryActionState = { error: string } | { success: true } | null

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  if (!name) return { error: 'Name ist erforderlich' }
  if (!type) return { error: 'Typ ist erforderlich' }

  const { error } = await supabase.from('categories').insert({
    name,
    type,
    user_id: user.id,
    parent_id: (formData.get('parent_id') as string) || null,
    color: (formData.get('color') as string) || null,
    icon: (formData.get('icon') as string) || null,
    budget_monthly: formData.get('budget_monthly')
      ? Number(formData.get('budget_monthly'))
      : null,
  })

  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { success: true }
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  if (!id) return { error: 'ID fehlt' }
  if (!name) return { error: 'Name ist erforderlich' }
  if (!type) return { error: 'Typ ist erforderlich' }

  const { error } = await supabase
    .from('categories')
    .update({
      name,
      type,
      parent_id: (formData.get('parent_id') as string) || null,
      color: (formData.get('color') as string) || null,
      icon: (formData.get('icon') as string) || null,
      budget_monthly: formData.get('budget_monthly')
        ? Number(formData.get('budget_monthly'))
        : null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { success: true }
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  // Guard: block deletion if category has children
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .eq('user_id', user.id)

  if (count && count > 0)
    return { error: 'Kategorie hat Unterkategorien. Bitte zuerst löschen.' }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return {}
}
