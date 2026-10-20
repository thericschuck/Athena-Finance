import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { seedIfEmpty } from './actions'
import { getBudgetCategories, getBudgetItems, getIncomeTarget } from '@/lib/data/finance-budget'
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

  // Layout redirected bereits, falls kein User eingeloggt ist — der Check
  // hier ist trotzdem nötig, um `user.id` unten typsicher (und nicht nur
  // durchs Layout garantiert) an die Queries zu geben.
  const { supabase, user } = await getAuthUser()
  if (!user) redirect('/login')

  // .eq('user_id', ...) zusätzlich zur RLS-Policy — siehe Kommentar in
  // actions.ts (updateCategory): dieselbe Defense-in-Depth-Konvention.
  const [categories, items, target] = await Promise.all([
    getBudgetCategories(supabase, user.id),
    getBudgetItems(supabase, user.id),
    getIncomeTarget(supabase, user.id),
  ])

  return (
    <LebenshaltungskostenClient
      categories={categories as BudgetCategory[]}
      items={items as BudgetItem[]}
      target={target as IncomeTarget | null}
    />
  )
}
