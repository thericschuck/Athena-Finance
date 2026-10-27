import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { istScopeContext, userIdVon, type ScopeArg } from '@/lib/data/scope-arg'

type DB = SupabaseClient<Database>

/** Spalten, die Konten-Liste, Detailseite und Konto-Formulare tatsächlich lesen. */
const ACCOUNT_COLUMNS = 'id, name, type, institution, currency, color, iban, bank_iban, is_active, sort_order, shared'

/** Konto für Anzeige und Bearbeiten-Dialog (ohne user_id/Zeitstempel/sort_order). */
export type AccountRow = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'name' | 'type' | 'institution' | 'currency' | 'color' | 'iban' | 'bank_iban' | 'is_active' | 'sort_order'
> & { shared?: boolean }

/** Auswahl-Konto (Verträge): id + name. */
export type AccountNameRow = { id: string; name: string }

/** Aktive Konto-Auswahl inkl. Farbe/Währung (Transaktionen-Formulare, Filter). */
export type AccountOptionRow = { id: string; name: string; color: string | null; currency: string }

/**
 * Die Summen-Views gruppieren nach (user_id, account_id): bucht ein zweites Haushaltsmitglied auf dasselbe Konto, gibt es zwei
 * Zeilen je Konto. Hier je Konto zusammenfassen (ein Nutzer: unveraendert eine Zeile je Konto).
 */
function summeJeKonto(rows: { account_id: string; balance: number }[]): { account_id: string; balance: number }[] {
  const je = new Map<string, number>()
  for (const r of rows) je.set(r.account_id, (je.get(r.account_id) ?? 0) + Number(r.balance))
  return [...je].map(([account_id, balance]) => ({ account_id, balance }))
}

/** Alle Konten des Nutzers (aktiv und inaktiv), Anzeigereihenfolge. */
export async function getAccounts(supabase: DB, ctx: ScopeContext): Promise<AccountRow[]> {
  const { data } = await applyAccountScope(supabase.from('accounts').select(ACCOUNT_COLUMNS), ctx, 'id')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return data ?? []
}

/** Ein Konto per ID, oder null. */
export async function getAccount(supabase: DB, ctx: ScopeContext, id: string): Promise<AccountRow | null> {
  const { data } = await applyAccountScope(supabase.from('accounts').select(ACCOUNT_COLUMNS), ctx, 'id')
    .eq('id', id)
    .single()
  return data
}

/** Alle Konten nur mit id + name (Verträge), nach sort_order. */
export async function getAccountNames(supabase: DB, ctx: ScopeContext): Promise<AccountNameRow[]> {
  const { data } = await applyAccountScope(supabase.from('accounts').select('id, name'), ctx, 'id')
    .order('sort_order')
  return data ?? []
}

/** Aktive Konten für Auswahlfelder und Filter. */
export async function getActiveAccountOptions(supabase: DB, ctx: ScopeContext): Promise<AccountOptionRow[]> {
  const { data } = await applyAccountScope(supabase.from('accounts').select('id, name, color, currency'), ctx, 'id')
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

/**
 * Alle Buchungen (nur Konto/Betrag/Typ) der Tabelle `transactions` für die Saldo-Summe je Konto.
 * Bewusst ohne limit: fließt in Salden ein. Achtung: unterliegt dem PostgREST-Deckel (1.000 Zeilen);
 * unbegrenzt, Kandidat für seitenweises Laden.
 */
export async function getManualBalanceSums(supabase: DB, ctx: ScopeContext) {
  const { data } = await applyAccountScope(supabase.from('account_balance_sums_manual').select('account_id, balance'), ctx)
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefüllt.
  return summeJeKonto((data ?? []) as { account_id: string; balance: number }[])
}

/** Gebuchter Bank-Saldo je IBAN (FinTS-Sync). */
export async function getBankBalances(supabase: DB, who: ScopeArg) {
  const q = supabase.from('bank_balance').select('account_iban, booked_balance, fetched_at')
  // bank_balance hat keine account_id: Scope ueber die IBANs der Scope-Konten (ctx.ibans, normalisiert wie die Spalte).
  const { data } = istScopeContext(who) ? await q.in('account_iban', who.ibans) : await q.eq('user_id', userIdVon(who))
  return data ?? []
}

/**
 * Summe ALLER Buchungen je Konto (manuell und Bank, View account_balance_sums_unified) — nur zum
 * Abgleich mit dem Bank-Saldo, nicht als Kontostand: bei Bankkonten liefert FinTS nur ein Zeitfenster.
 */
export async function getUnifiedBalanceSums(supabase: DB, ctx: ScopeContext) {
  const { data } = await applyAccountScope(supabase.from('account_balance_sums_unified').select('account_id, balance'), ctx)
  return summeJeKonto((data ?? []) as { account_id: string; balance: number }[])
}

/**
 * Datum der letzten Buchung je Konto, für die angegebenen Konten (YYYY-MM-DD). Gedacht für manuelle
 * Konten mit wenigen Buchungen — für ein Bankkonto mit tausenden Zeilen wäre das die falsche Abfrage
 * (dort gibt `bank_balance.fetched_at` die Frische an).
 */
export async function getLetzteBuchungen(supabase: DB, ctx: ScopeContext, accountIds: string[]) {
  const aus = new Map<string, string>()
  if (accountIds.length === 0) return aus
  const erlaubt = new Set(ctx.accountIds)
  const { data } = await applyAccountScope(supabase.from('unified_transactions').select('account_id, date'), ctx)
    .in('account_id', accountIds.filter(id => erlaubt.has(id)))
    .order('date', { ascending: false })
    .limit(1000)
  for (const r of data ?? []) {
    if (r.account_id && r.date && !aus.has(r.account_id)) aus.set(r.account_id, r.date)
  }
  return aus
}
