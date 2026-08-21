import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestCategory, buildLearnedCategoryMap } from '@/lib/fints/categorize'
import type { FinanceCategory } from '@/types/bank'

/**
 * GET /api/bank/transactions/suggest-categories
 *
 * Read-only: runs the same keyword-based suggestCategory() used at sync time against every
 * stored transaction and returns only the ones where the suggestion differs from what's
 * currently stored (covers both uncategorized and possibly-mis-categorized rows). Nothing
 * is written here — the caller applies accepted suggestions via the existing per-row
 * PATCH /api/bank/transactions/:id.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, type, color, icon, parent_id')
    .eq('user_id', user.id)

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 })

  const categoriesById = new Map((categories ?? []).map(c => [c.id, c as FinanceCategory]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bank_transactions')
    .select('id, description, counterpart_name, category_id, amount, value_date')
    .eq('user_id', user.id)
    .order('value_date', { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Learn "this counterparty is always category X" from what's already categorized, so a
  // transaction the user manually fixed (or an earlier suggestion they accepted) improves
  // every future suggestion for the same counterparty — not just the keyword rules.
  const learnedMap = buildLearnedCategoryMap(
    (data ?? []).filter((tx: { category_id: string | null }) => tx.category_id),
  )

  const suggestions = (data ?? [])
    .map((tx: { id: string; description: string | null; counterpart_name: string | null; category_id: string | null; amount: number; value_date: string }) => {
      const suggested = suggestCategory(tx.counterpart_name, tx.description, categories ?? [], learnedMap)
      return suggested && suggested.id !== tx.category_id
        ? {
            id: tx.id,
            description: tx.description,
            counterpart_name: tx.counterpart_name,
            amount: tx.amount,
            value_date: tx.value_date,
            current_category: tx.category_id ? categoriesById.get(tx.category_id) ?? null : null,
            suggested_category: suggested,
          }
        : null
    })
    .filter(Boolean)

  return NextResponse.json({ suggestions })
}
