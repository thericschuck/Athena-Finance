'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optUuid, optMoneyField, optIntField, moneyField } from '@/lib/api/schemas'

const PATH = '/finance/budget'
type State = { error: string } | { success: true } | null

const categorySchema = z.object({
  name: reqText('Name ist erforderlich', 100),
  icon: optText(32),
  monthly_budget: optMoneyField('Monatsbudget ist ungültig'),
  sort_order: optIntField('Reihenfolge ist ungültig').transform(v => v ?? 0),
})
const updateCategorySchema = categorySchema.extend({ id: idField() })

const itemFields = {
  name: reqText('Name ist erforderlich', 200),
  unit_price: moneyField('Preis ungültig'),
  quantity: optMoneyField('Menge ist ungültig').transform(v => v ?? 1),
  interval_days: moneyField('Intervall muss mindestens 1 Tag sein').refine(
    n => Number.isInteger(n) && n >= 1,
    'Intervall muss mindestens 1 Tag sein',
  ),
  notes: optText(2000),
}
const createItemSchema = z.object({
  ...itemFields,
  category_id: idField('Kategorie fehlt', 'Kategorie ist ungültig'),
})
const updateItemSchema = z.object({ id: idField(), ...itemFields })

// Prozentwerte: 0–100; leer → bisheriger Standard.
const pct = (fallback: number, msg: string) =>
  optMoneyField(msg)
    .refine(v => v === null || (v >= 0 && v <= 100), msg)
    .transform(v => v ?? fallback)
const incomeTargetSchema = z.object({
  id: optUuid(),
  label: optText(100).transform(v => v ?? 'Standard'),
  buffer_pct: pct(15, 'Puffer muss zwischen 0 und 100 % liegen'),
  tax_pct: pct(30, 'Steuer muss zwischen 0 und 100 % liegen'),
  savings_pct: pct(10, 'Sparquote muss zwischen 0 und 100 % liegen'),
})

// ── Categories ─────────────────────────────────────────────────────────────────

export async function createCategory(_prev: State, formData: FormData): Promise<State> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, categorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('budget_categories').insert({
    user_id: user.id,
    ...parsed.data,
  })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function updateCategory(_prev: State, formData: FormData): Promise<State> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateCategorySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  // .eq('user_id', ...) zusätzlich zur RLS-Policy — dieselbe Defense-in-Depth
  // wie bei bank_transactions/crypto-Actions: die Policy allein reicht,
  // die explizite Bedingung macht den Besitzer-Scope auch im Anwendungscode
  // sichtbar statt sich ausschließlich auf die DB-Ebene zu verlassen.
  const { error } = await supabase.from('budget_categories').update(fields).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase.from('budget_categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

// ── Items ──────────────────────────────────────────────────────────────────────

export async function createItem(_prev: State, formData: FormData): Promise<State> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createItemSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('budget_items').insert({
    user_id: user.id,
    ...parsed.data,
  })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function updateItem(_prev: State, formData: FormData): Promise<State> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateItemSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase.from('budget_items').update(fields).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function deleteItem(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase.from('budget_items').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

// ── Income Targets ─────────────────────────────────────────────────────────────

export async function upsertIncomeTarget(_prev: State, formData: FormData): Promise<State> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, incomeTargetSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...payload } = parsed.data

  const { error } = id
    ? await supabase.from('income_targets').update(payload).eq('id', id).eq('user_id', user.id)
    : await supabase.from('income_targets').insert({ ...payload, user_id: user.id })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

// ── Seed ───────────────────────────────────────────────────────────────────────

export async function seedIfEmpty(): Promise<void> {
  // Server Actions sind eigenständig aufrufbar (nicht nur über den
  // Seiten-Render-Baum, siehe layout.tsx-Redirect) — ohne dieses Gate könnte
  // jeder direkt gegen diese Action posten und beliebig oft Seed-Zeilen
  // einfügen. Gleiches Muster wie createCategory/upsertIncomeTarget oben.
  const { supabase, user } = await getAuthUser()
  if (!user) return

  const { count: catCount } = await supabase
    .from('budget_categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((catCount ?? 0) === 0) {
    const seeds = [
      { name: 'Lebensmittel', icon: '🛒', monthly_budget: 400, sort_order: 0 },
      { name: 'Körperpflege', icon: '🧴', monthly_budget: 50,  sort_order: 1 },
      { name: 'Haushalt',     icon: '🏠', monthly_budget: 80,  sort_order: 2 },
      { name: 'Transport',    icon: '🚗', monthly_budget: 150, sort_order: 3 },
      { name: 'Freizeit',     icon: '🎯', monthly_budget: 100, sort_order: 4 },
    ].map((seed) => ({ ...seed, user_id: user.id }))
    await supabase.from('budget_categories').insert(seeds)
  }

  const { count: targetCount } = await supabase
    .from('income_targets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((targetCount ?? 0) === 0) {
    await supabase.from('income_targets').insert({
      user_id: user.id,
      label: 'Standard', buffer_pct: 15, tax_pct: 30, savings_pct: 10,
    })
  }
}
