import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFinTSErrorDetails, startSync, upsertBankTransactions } from '@/lib/fints'

// The sidecar drives the whole dialog (incl. waiting for a decoupled app approval),
// so this route can block for a while. Give the platform enough headroom.
export const maxDuration = 300

/**
 * POST /api/bank/sync
 * Body: { startDate?: string, endDate?: string }
 *
 * Runs a full FinTS sync for the authenticated user via the Python sidecar and upserts the
 * resulting transactions. For decoupled SCA (SecureGo plus Direktfreigabe) the sidecar waits
 * for the in-app approval itself, so there is no separate TAN step — this call simply resolves
 * once the data is fetched. Returns { imported, skipped }.
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
    const result = await startSync(startDate, endDate)
    const { imported, skipped } = await upsertBankTransactions(supabase, user.id, result.transactions)
    return NextResponse.json({ imported, skipped })

  } catch (err) {
    const details = getFinTSErrorDetails(err)
    return NextResponse.json({
      error: details.message,
      fintsErrors: details.errors,
      fintsDebug: details.debugString,
    }, { status: 500 })
  }
}
