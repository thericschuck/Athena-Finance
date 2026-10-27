import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

/**
 * GET /api/finance/categories
 *
 * Read-only list of the household's Finance categories (RLS) (same `categories` table
 * used by /finance/categories), for consumers like the Banking page that categorize against
 * the real taxonomy instead of a separate one.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, type, color, icon, parent_id')
    .order('type')
    .order('sort_order')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ categories: data ?? [] })
}
