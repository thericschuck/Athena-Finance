import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ImportRow {
  date: string
  amount: number
  description?: string
  merchant?: string
  category_name?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { account_id: string; rows: ImportRow[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { account_id, rows } = body
  if (!account_id || !Array.isArray(rows)) {
    return Response.json({ error: 'account_id and rows are required' }, { status: 400 })
  }

  // Load categories for name lookup
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', user.id)

  const categoryMap = new Map<string, string>()
  for (const cat of categories ?? []) {
    categoryMap.set(cat.name.toLowerCase(), cat.id)
  }

  const errors: string[] = []
  const insertRows: {
    user_id: string
    account_id: string
    date: string
    amount: number
    type: string
    description: string | null
    merchant: string | null
    category_id: string | null
    currency: string
  }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (!row.date || row.amount == null) {
      errors.push(`Row ${i + 1}: missing date or amount`)
      continue
    }

    const type = row.amount >= 0 ? 'income' : 'expense'
    const amount = Math.abs(row.amount)

    const categoryId = row.category_name
      ? (categoryMap.get(row.category_name.toLowerCase()) ?? null)
      : null

    insertRows.push({
      user_id: user.id,
      account_id,
      date: row.date,
      amount,
      type,
      description: row.description ?? null,
      merchant: row.merchant ?? null,
      category_id: categoryId,
      currency: 'EUR',
    })
  }

  if (insertRows.length === 0) {
    return Response.json({ imported: 0, errors })
  }

  const { error: insertError } = await supabase.from('transactions').insert(insertRows)

  if (insertError) {
    return Response.json(
      { imported: 0, errors: [insertError.message, ...errors] },
      { status: 500 }
    )
  }

  return Response.json({ imported: insertRows.length, errors })
}
