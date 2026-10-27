import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  startSync, upsertBankTransactions, upsertDepotHoldings, upsertBankBalances,
  applySuggestionsToBacklog, loadLearnedCategoryMap, isCloudRuntime, triggerCloudBankSync,
  scaFreeStartDate, stateFromError,
} from '@/lib/fints'
import { loadBankClientState, saveBankClientState } from '@/lib/fints/state'
import { recordSyncResult, resolveConnectionsForUser, userHasBankAccess } from '@/lib/fints/connections'

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

/** Der Nutzer hat weder eine eigene Bankverbindung noch ist er der Env-Nutzer (BANK_SYNC_USER_ID). */
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
    // Zugriff: eigene Verbindung (bank_connections) ODER Env-Nutzer (BANK_SYNC_USER_ID mit vollständiger FINTS_*-Env).
    // Die Python-Funktion lädt/entschlüsselt die Verbindungen des Nutzers selbst (siehe docs/fints-verbindungen.md).
    if (!(await userHasBankAccess(userId))) {
      throw new BankSyncForbiddenError('Bank-Sync ist für dieses Konto nicht verfügbar. Bitte zuerst eine Bankverbindung eintragen.')
    }
    const origin = opts.origin ?? cloudOrigin()
    const result = await triggerCloudBankSync(origin, {
      userId,
      allowSca: true,
      fullHistory: opts.fullHistory === true,
    })
    if (result.scaRequired) {
      throw new BankScaRequiredError(result.message ?? 'Freigabe in der App erforderlich.')
    }
    // Der Cloud-Sync speichert nur Buchungen und setzt nie eine Kategorie. Die schnelle Stufe (Regeln und Gelerntes)
    // läuft deshalb hier; die KI-Stufe übernimmt /api/cron/categorize.
    let categorized = 0
    try {
      categorized = (await applySuggestionsToBacklog(supabase, userId)).applied
    } catch (err) {
      console.warn('[bank-sync] Kategorisierung nach Cloud-Sync fehlgeschlagen:', err)
    }
    return { imported: result.imported, skipped: result.skipped, balancesSynced: result.balances, categorized, warnings: result.warnings }
  }

  // Routine: innerhalb der 90-Tage-Ausnahme (keine Freigabe nötig). Volle Historie liegt
  // außerhalb davon und kostet immer eine Freigabe — nur auf ausdrücklichen Wunsch.
  const startDate = opts.startDate
    ?? (opts.fullHistory ? new Date('2000-01-01') : scaFreeStartDate())

  // Lokal: eigene Verbindungen aus der DB (entschlüsselt, nur für diesen Prozess) oder wie bisher die FINTS_*-Env.
  // Ohne eigene Verbindung und mit gesetztem, fremdem BANK_SYNC_USER_ID darf die Env-Verbindung nicht benutzt werden.
  const resolved = await resolveConnectionsForUser(userId)
  const envOwner = process.env.BANK_SYNC_USER_ID?.trim()
  if (resolved.source === 'none' && envOwner && envOwner !== userId) {
    throw new BankSyncForbiddenError('Bank-Sync ist für dieses Konto nicht verfügbar. Bitte zuerst eine Bankverbindung eintragen.')
  }
  const profiles = resolved.source === 'db' ? resolved.connections : undefined
  const dbBankKeys = resolved.source === 'db' ? resolved.connections.map(c => c.bankKey) : []

  try {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type, color, icon, parent_id')
      .eq('user_id', userId)

    const learnedMap = await loadLearnedCategoryMap(supabase, userId)

    // Der gespeicherte Client-State trägt die Kundensystem-ID — er verhindert, dass jeder
    // Sync wie ein neuer Zugang behandelt wird und eine Freigabe verlangt.
    const clientState = await loadBankClientState(userId)
    const result = await startSync(startDate, opts.endDate, categories ?? [], learnedMap, {
      state: clientState,
      profiles,
    })
    await saveBankClientState(userId, result.state)

    const { imported, skipped } = await upsertBankTransactions(supabase, userId, result.transactions)
    const { synced: holdingsSynced } = await upsertDepotHoldings(supabase, userId, result.holdings)
    // Salden zuletzt: der Trigger fn_ensure_linked_account spiegelt jede bank_balance-Zeile
    // nach account_balances — dadurch zeigen Konten-Seite und Charts den frischen Stand.
    const { synced: balancesSynced } = await upsertBankBalances(supabase, userId, result.balances)
    const { applied: categorizedCount } = await applySuggestionsToBacklog(supabase, userId)
    for (const w of result.warnings ?? []) console.warn('[bank-sync]', w)
    await recordSyncResult(userId, dbBankKeys, { ok: true })
    return {
      imported, skipped, holdingsSynced, balancesSynced,
      categorized: categorizedCount, warnings: result.warnings,
    }
  } catch (err) {
    // Ein Lauf kann für eine Bank scheitern und für eine andere brauchbaren State liefern.
    await saveBankClientState(userId, stateFromError(err))
    await recordSyncResult(userId, dbBankKeys, { ok: false, error: err instanceof Error ? err.message : null })
    throw err
  }
}

function cloudOrigin(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (!host) throw new Error('Cloud-Origin unbekannt (VERCEL_PROJECT_PRODUCTION_URL fehlt).')
  return `https://${host}`
}
