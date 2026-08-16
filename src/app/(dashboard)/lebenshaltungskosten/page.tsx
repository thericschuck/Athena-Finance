import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { seedIfEmpty } from './actions'
import { LebenshaltungskostenClient } from '@/components/lebenshaltungskosten/LebenshaltungskostenClient'

export type BudgetCategory = {
  id: string
  name: string
  icon: string | null
  monthly_budget: number | null
  sort_order: number
}

export type BudgetItem = {
  id: string
  category_id: string
  name: string
  unit_price: number
  quantity: number
  interval_days: number
  notes: string | null
}

export type IncomeTarget = {
  id: string
  label: string
  buffer_pct: number
  tax_pct: number
  savings_pct: number
}

export default async function LebenshaltungskostenPage() {
  await seedIfEmpty()

  const supabase = await createClient()
  // Layout redirected bereits, falls kein User eingeloggt ist — der Check
  // hier ist trotzdem nötig, um `user.id` unten typsicher (und nicht nur
  // durchs Layout garantiert) an die Queries zu geben.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // .eq('user_id', ...) zusätzlich zur RLS-Policy — siehe Kommentar in
  // actions.ts (updateCategory): dieselbe Defense-in-Depth-Konvention.
  const [
    { data: categories },
    { data: items },
    { data: targets },
  ] = await Promise.all([
    supabase.from('budget_categories').select('*').eq('user_id', user.id).order('sort_order').order('name'),
    supabase.from('budget_items').select('*').eq('user_id', user.id).order('name'),
    supabase.from('income_targets').select('*').eq('user_id', user.id).order('created_at').limit(1),
  ])

  return (
    <LebenshaltungskostenClient
      categories={(categories ?? []) as BudgetCategory[]}
      items={(items ?? []) as BudgetItem[]}
      target={(targets?.[0] ?? null) as IncomeTarget | null}
    />
  )
}
