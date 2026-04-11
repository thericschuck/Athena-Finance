import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startSync, type ParsedTransaction } from '@/lib/fints'

/**
 * POST /api/bank/sync
 * Body: { startDate?: string, endDate?: string }
 *
 * Initiates a FinTS sync for the authenticated user.
 * If the bank requires a TAN, returns { tanRequired: true, transactionRef, challengeText }.
 * Otherwise upserts transactions and returns { imported, skipped }.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  let startDate: Date | undefined
  let endDate:   Date | undefined

  try {
    const body = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string }
    if (body.startDate) startDate = new Date(body.startDate)
    if (body.endDate)   endDate   = new Date(body.endDate)
  } catch { /* no body */ }

  // Default: last 90 days
  if (!startDate) {
    startDate = new Date()
    startDate.setDate(startDate.getDate() - 90)
  }

  try {
    const result = await startSync(user.id, startDate, endDate)

    if ('tanRequired' in result) {
      return NextResponse.json({
        tanRequired:    true,
        transactionRef: result.transactionRef,
        challengeText:  result.challengeText,
        challengeMedia: result.challengeMedia,
      })
    }

    const { imported, skipped } = await upsertTransactions(user.id, result.transactions)
    return NextResponse.json({ imported, skipped })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertTransactions(
  userId: string,
  transactions: ParsedTransaction[],
): Promise<{ imported: number; skipped: number }> {
  if (transactions.length === 0) return { imported: 0, skipped: 0 }

  const supabase = await createClient()

  const rows = transactions.map(tx => ({
    user_id:          userId,
    account_iban:     tx.accountIban,
    account_bic:      tx.accountBic,
    amount:           tx.amount,
    currency:         tx.currency,
    value_date:       tx.valueDate,
    entry_date:       tx.entryDate,
    description:      tx.description,
    counterpart_name: tx.counterpartName,
    counterpart_iban: tx.counterpartIban,
    counterpart_bic:  tx.counterpartBic,
    category:         tx.category,
    raw_description:  tx.rawDescription,
    external_id:      tx.externalId,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)

  const imported = (data as { id: string }[] | null)?.length ?? 0
  const skipped  = rows.length - imported
  return { imported, skipped }
}
