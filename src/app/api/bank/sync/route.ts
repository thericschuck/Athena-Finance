import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getFinTSErrorDetails, startSync, upsertBankTransactions, upsertDepotHoldings,
  upsertBankBalances,
  isCloudRuntime, triggerCloudBankSync, scaFreeStartDate, stateFromError,
} from '@/lib/fints'
import { loadBankClientState, saveBankClientState } from '@/lib/fints/state'
import { buildLearnedCategoryMap } from '@/lib/fints/categorize'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
      return NextResponse.json({ imported: result.imported, skipped: result.skipped })
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

  if (!startDate) {
    startDate = fullHistory
      // As far back as the bank will give us. Transactions are deduplicated by external_id
      // downstream, so requesting more history than the bank retains is harmless. Costs an
      // app approval every time (older than 90 days is never SCA-exempt), hence opt-in.
      ? new Date('2000-01-01')
      // Routine sync: stay inside the 90-day exemption so no approval is needed.
      : scaFreeStartDate()
  }

  try {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type, color, icon, parent_id')
      .eq('user_id', user.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: categorized } = await (supabase as any)
      .from('bank_transactions')
      .select('counterpart_name, category_id')
      .eq('user_id', user.id)
      .not('category_id', 'is', null)
    const learnedMap = buildLearnedCategoryMap(categorized ?? [])

    // Handing the stored state to the sidecar is what suppresses the per-sync app
    // approval: it carries the Kundensystem-ID, so the bank recognises this as the same
    // access it already authenticated instead of a brand-new one.
    const clientState = await loadBankClientState(user.id)

    const result = await startSync(startDate, endDate, categories ?? [], learnedMap, {
      state: clientState,
    })
    await saveBankClientState(user.id, result.state)

    const { imported, skipped } = await upsertBankTransactions(supabase, user.id, result.transactions)
    const { synced: holdingsSynced } = await upsertDepotHoldings(supabase, user.id, result.holdings)
    // Balances last: the fn_ensure_linked_account trigger on bank_balance mirrors each row
    // into account_balances for today, so this is what makes the freshly synced figure the
    // one the accounts page and the charts show.
    const { synced: balancesSynced } = await upsertBankBalances(supabase, user.id, result.balances)
    return NextResponse.json({
      imported, skipped, holdingsSynced, balancesSynced, warnings: result.warnings,
    })

  } catch (err) {
    // A run can fail for one bank and still have produced usable state for another —
    // persist whatever came back so that bank doesn't need an extra approval next time.
    await saveBankClientState(user.id, stateFromError(err))

    const details = getFinTSErrorDetails(err)
    return NextResponse.json({
      error: details.message,
      fintsErrors: details.errors,
      fintsDebug: details.debugString,
    }, { status: 500 })
  }
}
