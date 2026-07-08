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

  const [
    { data: categories },
    { data: items },
    { data: targets },
  ] = await Promise.all([
    supabase.from('budget_categories').select('*').order('sort_order').order('name'),
    supabase.from('budget_items').select('*').order('name'),
    supabase.from('income_targets').select('*').order('created_at').limit(1),
  ])

  return (
    <LebenshaltungskostenClient
      categories={(categories ?? []) as BudgetCategory[]}
      items={(items ?? []) as BudgetItem[]}
      target={(targets?.[0] ?? null) as IncomeTarget | null}
    />
  )
}
