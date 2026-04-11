import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bank/transactions?iban=...&limit=100&offset=0&category=...&q=...
 *
 * Returns stored bank transactions for the authenticated user.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const iban     = searchParams.get('iban')
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500)
  const offset   = parseInt(searchParams.get('offset') ?? '0', 10)
  const category = searchParams.get('category')
  const q        = searchParams.get('q')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('bank_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('value_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (iban)     query = query.eq('account_iban', iban)
  if (category) query = query.eq('category', category)
  if (q)        query = query.ilike('description', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data ?? [] })
}
