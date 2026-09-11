import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { fetchBalances, isCloudRuntime, triggerCloudBankSync } from '@/lib/fints'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readCachedBalances(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('bank_balance')
    .select('*')
    .eq('user_id', userId)
    .order('account_iban')

  if (error) throw new Error(error.message)

  // Verknüpftes accounts-Konto nachreichen. Zwei Queries statt eines Embeds, weil die
  // Beziehung nur über accounts.bank_iban besteht und kein Fremdschlüssel ist — PostgREST
  // kann daraus keinen Join ableiten.
  const { data: linked } = await supabase
    .from('accounts')
    .select('id, bank_iban')
    .eq('user_id', userId)
    .not('bank_iban', 'is', null)

  const idByIban = new Map(
    (linked ?? []).map((a: { id: string; bank_iban: string }) => [a.bank_iban, a.id]),
  )

  return (data ?? []).map((b: { account_iban: string }) => ({
    ...b,
    account_id: idByIban.get(b.account_iban) ?? null,
  }))
}

/**
 * GET /api/bank/balance
 * Returns the last persisted balances from Supabase. Deliberately does NOT touch the FinTS
 * sidecar — this must stay fast and work everywhere the app is deployed (including Vercel,
 * where the Python sidecar isn't available). Balances are kept fresh by whichever scheduled
 * sync is running (local Task Scheduler and/or the Vercel Python cron function).
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
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
 * Explicit live refresh, then persists and returns the result. Locally this spawns the
 * FinTS sidecar directly; on Vercel it delegates to the sibling Python Function, which
 * upserts balances itself — this route then just re-reads the cache.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  if (isCloudRuntime()) {
    if (user.id !== process.env.BANK_SYNC_USER_ID) {
      return NextResponse.json({ error: 'Bank-Sync ist für dieses Konto nicht verfügbar.' }, { status: 403 })
    }
    try {
      const origin = new URL(request.url).origin
      await triggerCloudBankSync(origin)
      return NextResponse.json({ balances: await readCachedBalances(supabase, user.id) })
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Cloud-Sync fehlgeschlagen',
      }, { status: 500 })
    }
  }

  try {
    const balances = await fetchBalances()

    if (balances.length > 0) {
      const rows = balances.map(b => ({
        user_id:           user.id,
        bank_label:        b.bankLabel,
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
