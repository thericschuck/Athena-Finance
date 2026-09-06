'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CategoryActionState = { error: string } | { success: true } | null

/**
 * Erlaubte Werte fuer die steuerliche Rolle -- muss zum Check-Constraint aus
 * 20260906140000_tax_engine.sql passen. Leerer String heisst "nicht zugeordnet"
 * und wird zu NULL: die Steuer-Engine rechnet nur mit gesetzten Rollen und
 * meldet den Rest als unzugeordnet, statt etwas anzunehmen.
 */
const TAX_ROLES = ['betriebseinnahme', 'betriebsausgabe', 'lohn', 'privat'] as const

/**
 * Die EUER-Zeile. Geprueft wird nur die Form -- ob es die Nummer im
 * hinterlegten Jahrgang gibt, entscheidet der Rechenkern, und eine unbekannte
 * Nummer landet dort in der Sammelzeile statt zu verschwinden.
 */
function leseEuerZeile(formData: FormData): number | null {
  const roh = (formData.get('euer_zeile') as string | null)?.trim()
  if (!roh) return null
  const n = Number(roh)
  return Number.isInteger(n) && n > 0 && n < 200 ? n : null
}

function leseTaxRole(formData: FormData): string | null {
  const wert = (formData.get('tax_role') as string | null)?.trim()
  if (!wert) return null
  return (TAX_ROLES as readonly string[]).includes(wert) ? wert : null
}

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
    tax_role: leseTaxRole(formData),
    euer_zeile: leseEuerZeile(formData),
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
      tax_role: leseTaxRole(formData),
      euer_zeile: leseEuerZeile(formData),
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
