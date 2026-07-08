import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFinTSErrorDetails, startSync, upsertBankTransactions } from '@/lib/fints'

// The sidecar drives the whole FinTS dialog and can block for a while (e.g. if a decoupled
// SCA approval is ever required again) — give it the same headroom as the interactive route.
export const maxDuration = 300

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/cron/bank-sync
 *
 * Scheduled FinTS sync — no browser session exists for a cron trigger, so:
 *   - auth is a shared secret (Authorization: Bearer CRON_SECRET), matching every other
 *     /api/cron/* route in this app.
 *   - the target user is fixed via BANK_SYNC_USER_ID, because the FinTS credentials
 *     (FINTS_URL/BLZ/USERNAME/PIN) are a single global bank login, not per-user — unlike the
 *     other cron jobs in this app, this one is inherently single-tenant.
 *
 * Pulls the last 14 days (transactions are deduplicated by external_id, so a wider window
 * than the schedule interval just guards against a missed run).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.BANK_SYNC_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'BANK_SYNC_USER_ID nicht konfiguriert' }, { status: 500 })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 14)

  try {
    const supabase = adminClient()
    const result = await startSync(startDate, undefined)
    const { imported, skipped } = await upsertBankTransactions(supabase, userId, result.transactions)
    return NextResponse.json({ ok: true, imported, skipped })

  } catch (err) {
    const details = getFinTSErrorDetails(err)
    return NextResponse.json({
      ok: false,
      error: details.message,
      fintsErrors: details.errors,
      fintsDebug: details.debugString,
    }, { status: 500 })
  }
}
