import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchBalances } from '@/lib/fints'

/**
 * GET /api/bank/balance
 * Fetches live balances from FinTS and upserts into bank_balance.
 * Returns the persisted balances.
 *
 * POST /api/bank/balance
 * Same as GET but explicit refresh trigger.
 */
async function handler() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  try {
    const balances = await fetchBalances()

    if (balances.length > 0) {
      const rows = balances.map(b => ({
        user_id:           user.id,
        account_iban:      b.iban,
        account_bic:       b.bic,
        account_name:      b.accountName,
        booked_balance:    b.bookedBalance,
        available_balance: b.availableBalance,
        currency:          b.currency,
        fetched_at:        new Date().toISOString(),
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('bank_balance')
        .upsert(rows, { onConflict: 'user_id,account_iban' })

      if (error) throw new Error(error.message)
    }

    // Return the freshly stored balances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: readErr } = await (supabase as any)
      .from('bank_balance')
      .select('*')
      .eq('user_id', user.id)
      .order('account_iban')

    if (readErr) throw new Error(readErr.message)
    return NextResponse.json({ balances: data ?? [] })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export const GET  = handler
export const POST = handler
