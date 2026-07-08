import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchBalances } from '@/lib/fints'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readCachedBalances(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('bank_balance')
    .select('*')
    .eq('user_id', userId)
    .order('account_iban')

  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * GET /api/bank/balance
 * Returns the last persisted balances from Supabase. Deliberately does NOT touch the FinTS
 * sidecar — this must stay fast and work everywhere the app is deployed (including Vercel,
 * where the Python sidecar isn't available). Balances are kept fresh by whichever scheduled
 * sync is running (local Task Scheduler and/or the Vercel Python cron function).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  try {
    const balances = await readCachedBalances(supabase, user.id)
    return NextResponse.json({ balances })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/bank/balance
 * Explicit live refresh via the FinTS sidecar, then persists and returns the result.
 * Only works where the Python sidecar is reachable (i.e. locally) — not on Vercel.
 */
export async function POST() {
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

    return NextResponse.json({ balances: await readCachedBalances(supabase, user.id) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
