import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

/** Spalten, die Konten-Liste, Detailseite und Konto-Formulare tatsächlich lesen. */
const ACCOUNT_COLUMNS = 'id, name, type, institution, currency, color, iban, bank_iban, is_active'

/** Konto für Anzeige und Bearbeiten-Dialog (ohne user_id/Zeitstempel/sort_order). */
export type AccountRow = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'name' | 'type' | 'institution' | 'currency' | 'color' | 'iban' | 'bank_iban' | 'is_active'
>

/** Auswahl-Konto (Verträge): id + name. */
export type AccountNameRow = { id: string; name: string }

/** Aktive Konto-Auswahl inkl. Farbe/Währung (Transaktionen-Formulare, Filter). */
export type AccountOptionRow = { id: string; name: string; color: string | null; currency: string }

/** Alle Konten des Nutzers (aktiv und inaktiv), Anzeigereihenfolge. */
export async function getAccounts(supabase: DB, userId: string): Promise<AccountRow[]> {
  const { data } = await supabase
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return data ?? []
}

/** Ein Konto per ID, oder null. */
export async function getAccount(supabase: DB, userId: string, id: string): Promise<AccountRow | null> {
  const { data } = await supabase
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  return data
}

/** Alle Konten nur mit id + name (Verträge), nach sort_order. */
export async function getAccountNames(supabase: DB, userId: string): Promise<AccountNameRow[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .order('sort_order')
  return data ?? []
}

/** Aktive Konten für Auswahlfelder und Filter. */
export async function getActiveAccountOptions(supabase: DB, userId: string): Promise<AccountOptionRow[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name, color, currency')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

/**
 * Alle Buchungen (nur Konto/Betrag/Typ) der Tabelle `transactions` für die Saldo-Summe je Konto.
 * Bewusst ohne limit: fließt in Salden ein. Achtung: unterliegt dem PostgREST-Deckel (1.000 Zeilen);
 * unbegrenzt, Kandidat für seitenweises Laden.
 */
export async function getManualBalanceSums(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('account_balance_sums_manual')
    .select('account_id, balance')
    .eq('user_id', userId)
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefüllt.
  return (data ?? []) as { account_id: string; balance: number }[]
}

/** Gebuchter Bank-Saldo je IBAN (FinTS-Sync). */
export async function getBankBalances(supabase: DB, userId: string) {
  const { data } = await supabase
    .from('bank_balance')
    .select('account_iban, booked_balance')
    .eq('user_id', userId)
  return data ?? []
}
