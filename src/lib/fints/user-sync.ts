import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  startSync, upsertBankTransactions, upsertDepotHoldings, upsertBankBalances,
  applyLearnedCategoriesToBacklog, isCloudRuntime, triggerCloudBankSync,
  scaFreeStartDate, stateFromError,
} from '@/lib/fints'
import { loadBankClientState, saveBankClientState } from '@/lib/fints/state'
import { buildLearnedCategoryMap } from '@/lib/fints/categorize'

export type UserBankSyncResult = {
  imported: number
  skipped: number
  holdingsSynced?: number
  balancesSynced?: number
  categorized?: number
  warnings?: string[]
}

/** Die Bank verlangt eine Freigabe in der App, die die Cloud-Funktion nicht abwarten darf. */
export class BankScaRequiredError extends Error {}

/** Der Bank-Sync ist single-tenant (ein globaler FinTS-Login) und nur für diesen Nutzer freigegeben. */
export class BankSyncForbiddenError extends Error {}

/**
 * Nutzer-ausgelöster Bank-Sync — gemeinsamer Kern von `POST /api/bank/sync` und Athenas
 * Aktion `syncBank`. Lokal läuft der Python-Sidecar, auf Vercel die Schwester-Funktion
 * `api/bank-sync.py` (dort gibt es kein venv).
 *
 * Es ist immer jemand da, der in der App freigeben kann (der Nutzer hat den Sync selbst
 * angestoßen), deshalb ist hier — anders als im Cron — eine Freigabe erlaubt.
 */
export async function syncBankForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  opts: { fullHistory?: boolean; startDate?: Date; endDate?: Date; origin?: string } = {},
): Promise<UserBankSyncResult> {
  if (isCloudRuntime()) {
    if (userId !== process.env.BANK_SYNC_USER_ID) {
      throw new BankSyncForbiddenError('Bank-Sync ist für dieses Konto nicht verfügbar.')
    }
    const origin = opts.origin ?? cloudOrigin()
    const result = await triggerCloudBankSync(origin, {
      allowSca: true,
      fullHistory: opts.fullHistory === true,
    })
    if (result.scaRequired) {
      throw new BankScaRequiredError(result.message ?? 'Freigabe in der App erforderlich.')
    }
    return { imported: result.imported, skipped: result.skipped, balancesSynced: result.balances }
  }

  // Routine: innerhalb der 90-Tage-Ausnahme (keine Freigabe nötig). Volle Historie liegt
  // außerhalb davon und kostet immer eine Freigabe — nur auf ausdrücklichen Wunsch.
  const startDate = opts.startDate
    ?? (opts.fullHistory ? new Date('2000-01-01') : scaFreeStartDate())

  try {
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

    // Der gespeicherte Client-State trägt die Kundensystem-ID — er verhindert, dass jeder
    // Sync wie ein neuer Zugang behandelt wird und eine Freigabe verlangt.
    const clientState = await loadBankClientState(userId)
    const result = await startSync(startDate, opts.endDate, categories ?? [], learnedMap, {
      state: clientState,
    })
    await saveBankClientState(userId, result.state)

    const { imported, skipped } = await upsertBankTransactions(supabase, userId, result.transactions)
    const { synced: holdingsSynced } = await upsertDepotHoldings(supabase, userId, result.holdings)
    // Salden zuletzt: der Trigger fn_ensure_linked_account spiegelt jede bank_balance-Zeile
    // nach account_balances — dadurch zeigen Konten-Seite und Charts den frischen Stand.
    const { synced: balancesSynced } = await upsertBankBalances(supabase, userId, result.balances)
    const { applied: categorizedCount } = await applyLearnedCategoriesToBacklog(supabase, userId)
    for (const w of result.warnings ?? []) console.warn('[bank-sync]', w)
    return {
      imported, skipped, holdingsSynced, balancesSynced,
      categorized: categorizedCount, warnings: result.warnings,
    }
  } catch (err) {
    // Ein Lauf kann für eine Bank scheitern und für eine andere brauchbaren State liefern.
    await saveBankClientState(userId, stateFromError(err))
    throw err
  }
}

function cloudOrigin(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (!host) throw new Error('Cloud-Origin unbekannt (VERCEL_PROJECT_PRODUCTION_URL fehlt).')
  return `https://${host}`
}
