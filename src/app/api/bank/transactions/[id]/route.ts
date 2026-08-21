import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * PATCH /api/bank/transactions/:id
 * Body: { category_id: string | null }
 *
 * Updates the category of a single transaction. RLS ensures users can only touch their own rows.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null) as { category_id?: string | null } | null
  if (!body || !('category_id' in body)) {
    return NextResponse.json({ error: 'category_id erforderlich' }, { status: 400 })
  }

  const categoryId = body.category_id?.trim() || null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bank_transactions')
    .update({ category_id: categoryId })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, category_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  return NextResponse.json({ transaction: data })
}
