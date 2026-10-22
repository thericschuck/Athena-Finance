import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { applySuggestionsToBacklog, getFinTSErrorDetails, isCloudRuntime, triggerCloudBankSync } from '@/lib/fints'
import { syncBankForUser } from '@/lib/fints/user-sync'

// The sidecar drives the whole dialog (incl. waiting for a decoupled app approval),
// so this route can block for a while. Give the platform enough headroom.
export const maxDuration = 300

/**
 * POST /api/bank/sync
 * Body: { startDate?: string, endDate?: string, fullHistory?: boolean }
 *
 * Runs a FinTS sync for the authenticated user via the Python sidecar and upserts the
 * resulting transactions. For decoupled SCA (SecureGo plus Direktfreigabe) the sidecar waits
 * for the in-app approval itself, so there is no separate TAN step — this call simply resolves
 * once the data is fetched. Returns { imported, skipped }.
 *
 * SCA behaviour: the default window is the last 90 days, which is exactly what PSD2's
 * exemption for account information covers — combined with the persisted client state
 * (see @/lib/fints/state) this normally runs WITHOUT an app approval, and only needs one
 * every 90 days. `fullHistory: true` deliberately requests everything the bank still has;
 * that is outside the exemption and always costs an approval, so it's an explicit choice
 * by the user rather than the default it used to be.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  // On Vercel there is no local Python venv to spawn — delegate to the sibling Vercel
  // Python Function instead, which talks to the bank and upserts to Supabase itself.
  if (isCloudRuntime()) {
    if (user.id !== process.env.BANK_SYNC_USER_ID) {
      return NextResponse.json({ error: 'Bank-Sync ist für dieses Konto nicht verfügbar.' }, { status: 403 })
    }
    try {
      const origin = new URL(request.url).origin
      const body = await request.clone().json().catch(() => ({})) as { fullHistory?: boolean }
      // A user is watching this request, so an app approval is possible here (unlike the
      // cron path, which calls the same function without ?sca=1 and aborts instead).
      const result = await triggerCloudBankSync(origin, {
        allowSca: true,
        fullHistory: body.fullHistory === true,
      })
      if (result.scaRequired) {
        return NextResponse.json({ error: result.message ?? 'Freigabe in der App erforderlich.' }, { status: 409 })
      }
      // Der Cloud-Sync speichert nur Buchungen und setzt nie eine Kategorie. Die schnelle Stufe (Regeln und Gelerntes) läuft deshalb
      // gleich hier; die KI-Stufe übernimmt /api/cron/categorize kurz danach (sie braucht mehr Zeit als dieser Request übrig hat).
      let categorized = 0
      try { categorized = (await applySuggestionsToBacklog(supabase, user.id)).applied } catch { /* Sync gelungen, Kategorisierung holt der Cron nach */ }
      return NextResponse.json({ imported: result.imported, skipped: result.skipped, categorized })
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'Cloud-Sync fehlgeschlagen',
      }, { status: 500 })
    }
  }

  let startDate:   Date | undefined
  let endDate:     Date | undefined
  let fullHistory = false

  try {
    const body = await request.json().catch(() => ({})) as {
      startDate?: string; endDate?: string; fullHistory?: boolean
    }
    if (body.startDate) startDate = new Date(body.startDate)
    if (body.endDate)   endDate   = new Date(body.endDate)
    fullHistory = body.fullHistory === true
  } catch { /* no body */ }

  try {
    // Standardfenster: 90 Tage (innerhalb der PSD2-Ausnahme, siehe syncBankForUser).
    return NextResponse.json(await syncBankForUser(supabase, user.id, { startDate, endDate, fullHistory }))
  } catch (err) {
    const details = getFinTSErrorDetails(err)
    return NextResponse.json({
      error: details.message,
      fintsErrors: details.errors,
      fintsDebug: details.debugString,
    }, { status: 500 })
  }
}
