'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, reqEnum, optText, optUuid, optMoneyField } from '@/lib/api/schemas'

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

/** Betrieblicher Anteil in Prozent. Leer = null (= 100 %); ausserhalb 0-100 oder keine Zahl = null. */
function leseBusinessShare(formData: FormData): number | null {
  const roh = (formData.get('business_share') as string | null)?.trim().replace(',', '.')
  if (!roh) return null
  const n = Number(roh)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null
}

const categoryFields = {
  name: reqText('Name ist erforderlich', 100),
  type: reqEnum(['expense', 'income', 'neutral'] as const, 'Typ ist erforderlich'),
  parent_id: optUuid(),
  color: optText(32),
  icon: optText(64),
  budget_monthly: optMoneyField('Monatsbudget ist ungültig'),
}
const createCategorySchema = z.object(categoryFields)
const updateCategorySchema = z.object({ id: idField(), ...categoryFields })

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createCategorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('categories').insert({
    ...parsed.data,
    user_id: user.id,
    tax_role: leseTaxRole(formData),
    euer_zeile: leseEuerZeile(formData),
    business_share: leseBusinessShare(formData),
  })

  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { success: true }
}

export async function updateCategory(
  _prev: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateCategorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from('categories')
    .update({
      ...fields,
      tax_role: leseTaxRole(formData),
      euer_zeile: leseEuerZeile(formData),
      business_share: leseBusinessShare(formData),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { success: true }
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

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
