'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PATH = '/lebenshaltungskosten'
type State = { error: string } | { success: true } | null

// ── Categories ─────────────────────────────────────────────────────────────────

export async function createCategory(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Name ist erforderlich' }

  const { error } = await supabase.from('budget_categories').insert({
    user_id: user.id,
    name,
    icon:           (formData.get('icon') as string) || null,
    monthly_budget: formData.get('monthly_budget') ? Number(formData.get('monthly_budget')) : null,
    sort_order:     Number(formData.get('sort_order') || 0),
  })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function updateCategory(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id   = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id)   return { error: 'ID fehlt' }
  if (!name) return { error: 'Name ist erforderlich' }

  // .eq('user_id', ...) zusätzlich zur RLS-Policy — dieselbe Defense-in-Depth
  // wie bei bank_transactions/crypto-Actions: die Policy allein reicht,
  // die explizite Bedingung macht den Besitzer-Scope auch im Anwendungscode
  // sichtbar statt sich ausschließlich auf die DB-Ebene zu verlassen.
  const { error } = await supabase.from('budget_categories').update({
    name,
    icon:           (formData.get('icon') as string) || null,
    monthly_budget: formData.get('monthly_budget') ? Number(formData.get('monthly_budget')) : null,
    sort_order:     Number(formData.get('sort_order') || 0),
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase.from('budget_categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

// ── Items ──────────────────────────────────────────────────────────────────────

export async function createItem(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name          = (formData.get('name') as string)?.trim()
  const category_id   = formData.get('category_id') as string
  const unit_price    = Number(formData.get('unit_price'))
  const quantity      = Number(formData.get('quantity') || 1)
  const interval_days = Number(formData.get('interval_days'))

  if (!name)              return { error: 'Name ist erforderlich' }
  if (!category_id)       return { error: 'Kategorie fehlt' }
  if (isNaN(unit_price))  return { error: 'Preis ungültig' }
  if (!interval_days || interval_days < 1) return { error: 'Intervall muss mindestens 1 Tag sein' }

  const { error } = await supabase.from('budget_items').insert({
    user_id: user.id,
    name,
    category_id,
    unit_price,
    quantity,
    interval_days,
    notes: (formData.get('notes') as string) || null,
  })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function updateItem(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id            = formData.get('id') as string
  const name          = (formData.get('name') as string)?.trim()
  const unit_price    = Number(formData.get('unit_price'))
  const quantity      = Number(formData.get('quantity') || 1)
  const interval_days = Number(formData.get('interval_days'))

  if (!id)             return { error: 'ID fehlt' }
  if (!name)           return { error: 'Name ist erforderlich' }
  if (isNaN(unit_price)) return { error: 'Preis ungültig' }
  if (!interval_days || interval_days < 1) return { error: 'Intervall muss mindestens 1 Tag sein' }

  const { error } = await supabase.from('budget_items').update({
    name,
    unit_price,
    quantity,
    interval_days,
    notes: (formData.get('notes') as string) || null,
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

export async function deleteItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase.from('budget_items').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

// ── Income Targets ─────────────────────────────────────────────────────────────

export async function upsertIncomeTarget(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id          = formData.get('id') as string | null
  const label       = (formData.get('label') as string)?.trim() || 'Standard'
  const buffer_pct  = Number(formData.get('buffer_pct') || 15)
  const tax_pct     = Number(formData.get('tax_pct') || 30)
  const savings_pct = Number(formData.get('savings_pct') || 10)

  const payload = { label, buffer_pct, tax_pct, savings_pct }

  const { error } = id
    ? await supabase.from('income_targets').update(payload).eq('id', id).eq('user_id', user.id)
    : await supabase.from('income_targets').insert({ ...payload, user_id: user.id })

  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { success: true }
}

// ── Seed ───────────────────────────────────────────────────────────────────────

export async function seedIfEmpty(): Promise<void> {
  const supabase = await createClient()
  // Server Actions sind eigenständig aufrufbar (nicht nur über den
  // Seiten-Render-Baum, siehe layout.tsx-Redirect) — ohne dieses Gate könnte
  // jeder direkt gegen diese Action posten und beliebig oft Seed-Zeilen
  // einfügen. Gleiches Muster wie createCategory/upsertIncomeTarget oben.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { count: catCount } = await supabase
    .from('budget_categories')
    .select('*', { count: 'exact', head: true })
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
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((targetCount ?? 0) === 0) {
    await supabase.from('income_targets').insert({
      user_id: user.id,
      label: 'Standard', buffer_pct: 15, tax_pct: 30, savings_pct: 10,
    })
  }
}
