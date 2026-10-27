import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { z } from 'zod'
import { parseQuery } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

// Leere Parameter (`?q=`) zählen wie fehlende.
const emptyToUndef = (v: unknown) => (v === '' ? undefined : v)

const querySchema = z.object({
  iban: z.preprocess(emptyToUndef, z.string().max(64).optional()),
  // Obergrenze wird gekappt statt abgelehnt (wie bisher Math.min(.., 5000)).
  limit: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).optional().transform(v => Math.min(v ?? 3000, 5000)),
  ),
  offset: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional().transform(v => v ?? 0)),
  categoryId: z.preprocess(emptyToUndef, uuid.optional()),
  q: z.preprocess(emptyToUndef, z.string().max(200).optional()),
})

/**
 * GET /api/bank/transactions?iban=...&limit=100&offset=0&category=...&q=...
 *
 * Returns stored bank transactions of the accounts in the current household scope.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = parseQuery(request, querySchema)
  if (parsed.response) return parsed.response
  // Default/cap raised from 200/500: monthly aggregation and the balance-history chart need
  // the account's full ledger, not just the most recent rows — a count cap silently truncates
  // the oldest visible month and throws off the reconstructed running balance.
  const { iban, limit, offset, categoryId, q } = parsed.data

  // Spalten explizit statt '*': external_id ist ein base64-Hash, den ausschliesslich die
  // Dedup beim Sync braucht — im Browser wird sie nie gelesen, macht aber rund 12 % der
  // uebertragenen Nutzlast aus.
  const ctx = await resolveScope(supabase, user)
  // Buchungen der Konten im Scope (bank_transactions hat keine account_id: ueber die IBAN).
  let query = supabase
    .from('bank_transactions')
    .select(
      'id, user_id, bank_label, account_iban, account_bic, amount, currency, value_date, ' +
      'entry_date, description, counterpart_name, counterpart_iban, counterpart_bic, ' +
      'category_id, raw_description, bank_reference, created_at',
    )
    .in('account_iban', ctx.ibans)
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
