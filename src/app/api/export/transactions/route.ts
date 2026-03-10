import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const accountId = searchParams.get('account_id')

  let query = supabase
    .from('transactions')
    .select(
      `date, amount, type, description, merchant, currency,
       account:accounts!transactions_account_id_fkey(name),
       category:categories(name)`
    )
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (accountId) {
    query = query.eq('account_id', accountId)
  }

  const { data: transactions, error } = await query

  if (error) {
    return new Response('Error fetching transactions', { status: 500 })
  }

  const headers = ['datum', 'betrag', 'beschreibung', 'haendler', 'kategorie', 'konto', 'waehrung']
  const lines: string[] = [headers.join(',')]

  for (const tx of transactions ?? []) {
    let amount: number
    if (tx.type === 'expense') {
      amount = -Math.abs(tx.amount)
    } else if (tx.type === 'income') {
      amount = Math.abs(tx.amount)
    } else {
      amount = tx.amount
    }

    const account = tx.account as { name: string } | null
    const category = tx.category as { name: string } | null

    const row = [
      escapeCSV(tx.date),
      escapeCSV(amount),
      escapeCSV(tx.description),
      escapeCSV(tx.merchant),
      escapeCSV(category?.name),
      escapeCSV(account?.name),
      escapeCSV(tx.currency),
    ]
    lines.push(row.join(','))
  }

  const csv = lines.join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="transaktionen.csv"',
    },
  })
}
