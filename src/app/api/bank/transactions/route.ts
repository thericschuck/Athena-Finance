import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

/**
 * GET /api/bank/transactions?iban=...&limit=100&offset=0&category=...&q=...
 *
 * Returns stored bank transactions for the authenticated user.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const iban       = searchParams.get('iban')
  // Default/cap raised from 200/500: monthly aggregation and the balance-history chart need
  // the account's full ledger, not just the most recent rows — a count cap silently truncates
  // the oldest visible month and throws off the reconstructed running balance.
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '3000', 10), 5000)
  const offset     = parseInt(searchParams.get('offset') ?? '0', 10)
  const categoryId = searchParams.get('categoryId')
  const q          = searchParams.get('q')

  // Spalten explizit statt '*': external_id ist ein base64-Hash, den ausschliesslich die
  // Dedup beim Sync braucht — im Browser wird sie nie gelesen, macht aber rund 12 % der
  // uebertragenen Nutzlast aus.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('bank_transactions')
    .select(
      'id, user_id, bank_label, account_iban, account_bic, amount, currency, value_date, ' +
      'entry_date, description, counterpart_name, counterpart_iban, counterpart_bic, ' +
      'category_id, raw_description, bank_reference, created_at',
    )
    .eq('user_id', user.id)
    .order('value_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (iban)       query = query.eq('account_iban', iban)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (q)          query = query.ilike('description', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data ?? [] })
}
