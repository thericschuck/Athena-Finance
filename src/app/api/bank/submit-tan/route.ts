import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { completeSync } from '@/lib/fints'

/**
 * POST /api/bank/submit-tan
 * Body: { transactionRef: string, tan: string }
 *
 * Completes a TAN-gated FinTS sync.
 * Restores the serialized dialog from Supabase, calls completeStatements,
 * then upserts the resulting transactions.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const body = await request.json().catch(() => null) as { transactionRef?: string; tan?: string } | null
  if (!body?.transactionRef || !body?.tan) {
    return NextResponse.json({ error: 'transactionRef und tan erforderlich' }, { status: 400 })
  }

  try {
    const result = await completeSync(user.id, body.transactionRef, body.tan)

    if (result.transactions.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 })
    }

    const rows = result.transactions.map(tx => ({
      user_id:          user.id,
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
    return NextResponse.json({ imported, skipped })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
