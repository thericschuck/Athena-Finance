import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { lies } from '@/lib/data/lies'

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

/**
 * Alle Konten des Nutzers (aktiv und inaktiv), Anzeigereihenfolge.
 *
 * Pro Request einmal (React `cache()`, Schluessel = dieselben Objekte `supabase` aus getAuthUser() und `ctx` aus resolveScope(); AUDIT.md C2):
 * Dashboard, Prognose und Konten-Seiten teilen sich das Ergebnis. Das Ergebnis ist geteilt und darf nicht veraendert werden.
 * Liest mit `lies`: ein Lesefehler wirft (AUDIT.md B1), statt still eine leere Kontenliste zu liefern.
 */
export const getAccounts = cache(async (supabase: DB, ctx: ScopeContext): Promise<AccountRow[]> => {
  return lies(
    applyAccountScope(supabase.from('accounts').select(ACCOUNT_COLUMNS), ctx, 'id')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'accounts',
  )
})

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

/** Gebuchter Bank-Saldo je IBAN (FinTS-Sync). Pro Request einmal (React `cache()`, siehe getAccounts); Ergebnis nicht veraendern. */
export const getBankBalances = cache(async (supabase: DB, ctx: ScopeContext) => {
  const q = supabase.from('bank_balance').select('account_iban, booked_balance, fetched_at')
  // bank_balance hat keine account_id: Scope ueber die IBANs der Scope-Konten (ctx.ibans, normalisiert wie die Spalte).
  const { data } = await q.in('account_iban', ctx.ibans)
  return data ?? []
})

/**
 * Summe ALLER Buchungen je Konto (manuell und Bank, View account_balance_sums_unified) — nur zum
 * Abgleich mit dem Bank-Saldo, nicht als Kontostand: bei Bankkonten liefert FinTS nur ein Zeitfenster.
 */
export async function getUnifiedBalanceSums(supabase: DB, ctx: ScopeContext) {
  return (await getUnifiedBalanceSumsMitAnzahl(supabase, ctx)).map(({ account_id, balance }) => ({ account_id, balance }))
}

export type BalanceSum = { account_id: string; balance: number; tx_count: number }

/**
 * Wie getUnifiedBalanceSums, zusaetzlich mit der Buchungsanzahl je Konto (Dashboard). Eine einzige Abfrage fuer beide Leser, pro Request
 * einmal (React `cache()`, siehe getAccounts): Dashboard und Prognose lasen dieselbe View sonst doppelt. Ergebnis nicht veraendern.
 * Bewusst OHNE flow_kind-Filter: ein Krypto-Kauf ist keine Ausgabe, senkt das Girokonto aber sehr wohl. Liest mit `lies` (wirft bei Fehler).
 */
export const getUnifiedBalanceSumsMitAnzahl = cache(async (supabase: DB, ctx: ScopeContext): Promise<BalanceSum[]> => {
  const q = supabase.from('account_balance_sums_unified').select('account_id, balance, tx_count')
  // View-Spalten sind im generierten Typ nullable, in der Praxis gefuellt.
  const rows = (await lies(applyAccountScope(q, ctx), 'account_balance_sums_unified')) as BalanceSum[]
  // Die View gruppiert nach (user_id, account_id): buchen zwei Mitglieder auf dasselbe Konto, gibt es zwei Zeilen, die zusammengehoeren.
  const je = new Map<string, BalanceSum>()
  for (const r of rows) {
    const alt = je.get(r.account_id)
    je.set(r.account_id, alt
      ? { account_id: r.account_id, balance: Number(alt.balance) + Number(r.balance), tx_count: Number(alt.tx_count) + Number(r.tx_count) }
      : r)
  }
  return [...je.values()]
})

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
