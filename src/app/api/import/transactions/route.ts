import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/validate'

// Zeilen werden einzeln geprüft, damit ein kaputter Eintrag nicht den ganzen Import kippt.
const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss JJJJ-MM-TT sein'),
  amount: z.number().finite(),
  description: z.string().max(500).nullish(),
  merchant: z.string().max(200).nullish(),
  category_name: z.string().max(100).nullish(),
})

const bodySchema = z.object({
  account_id: z.uuid(),
  rows: z.array(z.unknown()).max(5000),
})

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthUser()

  if (!user) {
    return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  }

  const parsed = await parseBody(req, bodySchema)
  if (parsed.response) return parsed.response
  const { account_id, rows } = parsed.data

  // Haushaltskonto: die RLS begrenzt auf den Haushalt (jedes Mitglied darf buchen); user_id der Buchung = Handelnder.
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', account_id)
    .maybeSingle()
  if (!account) {
    return Response.json({ error: 'Konto nicht gefunden' }, { status: 404 })
  }

  // Load categories for name lookup (Kategorienbaum pro Haushalt, RLS)
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')

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
    const parsedRow = rowSchema.safeParse(rows[i])
    if (!parsedRow.success) {
      errors.push(`Zeile ${i + 1}: Datum oder Betrag fehlt bzw. ist ungültig`)
      continue
    }
    const row = parsedRow.data

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
