import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getAccount,
  getActiveAccountOptions,
  getBankBalances,
  getLetzteBuchungen,
  getUnifiedBalanceSums,
  type AccountOptionRow,
  type AccountRow,
} from '@/lib/data/finance-accounts'
import {
  getAccountTransactions,
  getCategoryOptions,
  type AccountTransactionRow,
  type CategoryOptionRow,
} from '@/lib/data/finance-transactions'
import { fetchBalanceHistory, type BalanceSnapshot } from '@/lib/account-history'
import { abweichungVon } from '@/lib/konten/berechnen'
import type { KontoStand } from '@/lib/konten/typen'
import { getSettings } from '@/lib/settings'

/**
 * Rohdaten der Konto-Detailseite. Die Auswertung (Kennzahlen, Monate, Kategorien, Tabelle, Seiten)
 * rechnet `rechneDetail` (lib/konten/detail.ts) — rein und getestet; hier wird nur geladen.
 *
 * Zusätzlich die Kontodaten, die auf der Liste nur in Tooltips standen: IBAN, Sync-Zeitpunkt bzw.
 * letzte Buchung und bei Bankkonten die Abweichung zwischen gemeldetem Saldo und Buchungssumme.
 */
export interface KontoDetailDaten {
  account: AccountRow
  accounts: AccountOptionRow[]
  categories: CategoryOptionRow[]
  rows: AccountTransactionRow[]
  balanceHistory: BalanceSnapshot[]
  locale: string
  dateFormat: string
  /** Von der Bank gemeldeter Saldo (nur bankverknüpfte Konten mit Sync). */
  bankSaldo: number | null
  buchungssumme: number | null
  abweichung: number | null
  stand: KontoStand | null
}

type DB = SupabaseClient<Database>

/** `null`, wenn es das Konto nicht (oder nicht für diesen Nutzer) gibt. */
export async function ladeKontoDetail(supabase: DB, userId: string, id: string): Promise<KontoDetailDaten | null> {
  const [account, accounts, categories, rows, balanceHistory, settings, bank, unified] = await Promise.all([
    getAccount(supabase, userId, id),
    getActiveAccountOptions(supabase, userId),
    getCategoryOptions(supabase, userId),
    getAccountTransactions(supabase, userId, id),
    // Komplette Historie (nicht nur der Zeitraum): der Kontostand kommt aus dem letzten Punkt.
    fetchBalanceHistory(supabase, { accountId: id }),
    getSettings(userId),
    getBankBalances(supabase, userId),
    getUnifiedBalanceSums(supabase, userId),
  ])
  if (!account) return null

  const bankZeile = account.bank_iban ? bank.find((b) => b.account_iban === account.bank_iban) : undefined
  const bankSaldo = bankZeile ? Number(bankZeile.booked_balance) : null
  const summeZeile = unified.find((u) => u.account_id === id)
  const buchungssumme = summeZeile ? Number(summeZeile.balance) : null

  let stand: KontoStand | null = null
  if (bankZeile) stand = { art: 'sync', wert: bankZeile.fetched_at }
  else {
    const letzte = (await getLetzteBuchungen(supabase, userId, [id])).get(id)
    if (letzte) stand = { art: 'buchung', wert: letzte }
  }

  return {
    account,
    accounts,
    categories,
    rows,
    balanceHistory,
    locale: (settings.number_format as string) ?? 'de-DE',
    dateFormat: (settings.date_format as string) ?? 'dd.MM.yyyy',
    bankSaldo,
    buchungssumme,
    abweichung: abweichungVon(bankSaldo, buchungssumme),
    stand,
  }
}
