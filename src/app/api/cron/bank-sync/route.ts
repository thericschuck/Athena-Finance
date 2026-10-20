import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getFinTSErrorDetails, startSync, upsertBankTransactions, upsertDepotHoldings,
  upsertBankBalances, isScaRequiredError, stateFromError, applyLearnedCategoriesToBacklog,
} from '@/lib/fints'
import { buildLearnedCategoryMap } from '@/lib/fints/categorize'
import { loadBankClientState, saveBankClientState, markScaRequired } from '@/lib/fints/state'
import { requireCron } from '@/lib/api/auth'

// The sidecar drives the whole FinTS dialog. It runs with noSca, so it can no longer block
// for minutes waiting on an app approval — but the dialog itself plus a full camt.052 fetch
// still needs real headroom.
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
 * than the schedule interval just guards against a missed run). That is well inside PSD2's
 * 90-day exemption for account information, so with a valid persisted client state this
 * needs no app approval at all.
 *
 * When the exemption HAS expired (or no state exists yet), the bank demands an approval
 * that nobody is around to give. Rather than block for minutes on it, the sidecar runs with
 * noSca and aborts immediately; we record that in fints_client_state.sca_required_since so
 * the /bank page can tell the user that one manual sync is due. This is unavoidable — the
 * 90-day re-authentication is regulatory, not a limitation of this implementation.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const userId = process.env.BANK_SYNC_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'BANK_SYNC_USER_ID nicht konfiguriert' }, { status: 500 })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 14)

  try {
    const supabase = adminClient()
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type, color, icon, parent_id')
      .eq('user_id', userId)

    const { data: categorized } = await supabase
      .from('bank_transactions')
      .select('counterpart_name, category_id')
      .eq('user_id', userId)
      .not('category_id', 'is', null)
    const learnedMap = buildLearnedCategoryMap(categorized ?? [])

    const clientState = await loadBankClientState(userId)

    const result = await startSync(startDate, undefined, categories ?? [], learnedMap, {
      state: clientState,
      noSca: true,
    })
    await saveBankClientState(userId, result.state)

    // Some banks succeeded, at least one needs an approval — flag it, but keep the data
    // the others returned.
    if (result.scaRequired.length > 0) await markScaRequired(userId)

    const { imported, skipped } = await upsertBankTransactions(supabase, userId, result.transactions)
    const { synced: holdingsSynced } = await upsertDepotHoldings(supabase, userId, result.holdings)
    const { synced: balancesSynced } = await upsertBankBalances(supabase, userId, result.balances)
    const { applied: backlogCategorized } = await applyLearnedCategoriesToBacklog(supabase, userId)
    return NextResponse.json({
      ok: true, imported, skipped, holdingsSynced, balancesSynced,
      categorized: backlogCategorized,
      warnings: result.warnings,
      scaRequired: result.scaRequired,
    })

  } catch (err) {
    await saveBankClientState(userId, stateFromError(err))

    // Every configured bank aborted for want of an approval. Not a malfunction: the 90-day
    // exemption has run out. Report 200 with scaRequired so the cron run isn't logged as a
    // failure and doesn't trigger retry noise — the fix is one manual sync, not a redeploy.
    if (isScaRequiredError(err)) {
      await markScaRequired(userId)
      return NextResponse.json({
        ok: true,
        skippedReason: 'sca_required',
        imported: 0,
        skipped: 0,
        message: 'Bank verlangt eine Freigabe in der SecureGo plus App — bitte einmal '
               + 'manuell synchronisieren. Danach läuft der automatische Sync wieder '
               + 'rund 90 Tage ohne Freigabe.',
      })
    }

    const details = getFinTSErrorDetails(err)
    return NextResponse.json({
      ok: false,
      error: details.message,
      fintsErrors: details.errors,
      fintsDebug: details.debugString,
    }, { status: 500 })
  }
}
