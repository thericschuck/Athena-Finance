import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

// ─── Buchungen (View unified_transactions) ────────────────────────────────────────────────

/**
 * Zeile der View `unified_transactions` (siehe Migration 20260821010000) — führt die manuelle
 * `transactions`-Tabelle mit FinTS-gesyncten `bank_transactions` zusammen. Die generierten
 * View-Typen sind durchgehend nullable, deshalb hier das tatsächliche Schema der benutzten Spalten.
 */
export type UnifiedTxRow = {
  id: string
  account_id: string | null
  category_id: string | null
  date: string
  type: string
  amount: number
  currency: string
  description: string | null
  merchant: string | null
  transfer_to: string | null
  source: 'manual' | 'bank_sync'
  signed_amount: number
  /** echt | anlage | forderung | umbuchung | anfangsbestand — siehe unified_transactions. */
  flow_kind: string
  /** Woher die Kategorie einer Bankbuchung stammt: auto (Regel/Gelerntes), ai (KI), manual (du); sonst null. */
  category_source: string | null
  /** Vorschlag der KI; bei offenen Buchungen der Vorschlag, bei gesetzten der ursprüngliche KI-Wert. */
  ai_category_id: string | null
}

/** Zeile der globalen Transaktionsliste (zusätzlich Konto-Name/-Farbe für die Tabelle). */
export type TransactionListRow = UnifiedTxRow & {
  account_name: string | null
  account_color: string | null
}

/** Zeile der Konto-Detailseite (zusätzlich Kategorie-Name/-Farbe für die Auswertung). */
export type AccountTransactionRow = UnifiedTxRow & {
  category_name: string | null
  category_color: string | null
}

export type TransactionListFilters = {
  type?: string
  account?: string
  category?: string
  from?: string
  to?: string
  q?: string
}

const UNIFIED_BASE_COLUMNS =
  'id, account_id, category_id, date, type, amount, currency, description, merchant, transfer_to, source, signed_amount, flow_kind, category_source, ai_category_id'
const TRANSACTION_LIST_COLUMNS = `${UNIFIED_BASE_COLUMNS}, account_name, account_color`
const ACCOUNT_TRANSACTION_COLUMNS = `${UNIFIED_BASE_COLUMNS}, category_name, category_color`

/**
 * Eine Seite der Transaktionsliste (gefiltert, serverseitig paginiert) samt Gesamtzahl.
 * `page` ist 1-basiert. Gibt `error` zurück statt zu werfen — die Seite behandelt eine leere/
 * hinter dem Ende liegende Seite selbst.
 */
export async function getTransactionsPage(
  supabase: DB,
  userId: string,
  opts: { filters: TransactionListFilters; page: number; pageSize: number },
): Promise<{ rows: TransactionListRow[]; count: number | null; error: { message: string } | null }> {
  const { filters, page, pageSize } = opts

  let query = supabase
    .from('unified_transactions')
    .select(TRANSACTION_LIST_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .order('date', { ascending: false })
    // Zweites Sortierkriterium: `date` ist ein Datum, kein Zeitstempel. Ohne eindeutige
    // Ordnung (`id`) wäre die Seiteneinteilung nicht stabil (Buchung auf zwei Seiten / auf keiner).
    .order('id', { ascending: false })

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.account) query = query.eq('account_id', filters.account)
  if (filters.category) query = query.eq('category_id', filters.category)
  if (filters.from) query = query.gte('date', filters.from)
  if (filters.to) query = query.lte('date', filters.to)
  if (filters.q) {
    // Kommas und Klammern trennen in PostgREST die or()-Bedingungen — unmaskiert würde ein
    // Suchbegriff mit diesen Zeichen die Query zerlegen statt gefiltert zu werden.
    const term = filters.q.replace(/[,()*]/g, ' ').trim()
    if (term) query = query.or(`description.ilike.%${term}%,merchant.ilike.%${term}%`)
  }

  const von = (page - 1) * pageSize
  const { data, count, error } = await query.range(von, von + pageSize - 1)

  return {
    rows: (data ?? []) as unknown as TransactionListRow[],
    count,
    error,
  }
}

/**
 * Alle Buchungen eines Kontos (Konto-Detailseite). Fließt in Summen, Monats-Chart und
 * Kategorie-Auswertung ein und muss deshalb vollständig sein. PostgREST deckelt jede Antwort
 * still bei 1.000 Zeilen (Begründung in `src/lib/account-history.ts`) — deshalb seitenweise
 * laden. `id` als zweites Sortierkriterium: `date` allein ist nicht eindeutig, ohne stabile
 * Gesamtordnung kämen Zeilen zwischen zwei Seiten doppelt oder gar nicht.
 */
const PAGE_SIZE = 1000
const MAX_PAGES = 50

export async function getAccountTransactions(
  supabase: DB,
  userId: string,
  accountId: string,
): Promise<AccountTransactionRow[]> {
  const rows: AccountTransactionRow[] = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await supabase
      .from('unified_transactions')
      .select(ACCOUNT_TRANSACTION_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as AccountTransactionRow[]))
    offset += data.length
  }
  return rows
}

/**
 * Manuell gebuchte Transaktionen eines Vertrags (Vertrags-Detailseite, Gesamtsumme).
 * Unbegrenzt (Summe und Anzahl der Seite hängen daran), Kandidat für Paginierung.
 */
export async function getContractTransactions(supabase: DB, userId: string, contractId: string) {
  const { data } = await supabase
    .from('transactions')
    .select('id, date, description, amount, currency, type')
    .eq('contract_id', contractId)
    .eq('user_id', userId)
    .order('date', { ascending: false })
  return data ?? []
}

// ─── Kategorien ───────────────────────────────────────────────────────────────────────────

const CATEGORY_COLUMNS =
  'id, name, type, color, icon, parent_id, sort_order, budget_monthly, tax_role, euer_zeile, business_share'

/** Kategorie mit allen für Verwaltung und Formulare gelesenen Spalten. */
export type CategoryRow = Pick<
  Database['public']['Tables']['categories']['Row'],
  'id' | 'name' | 'type' | 'color' | 'icon' | 'parent_id' | 'sort_order' | 'budget_monthly' | 'tax_role' | 'euer_zeile' | 'business_share'
>

/** Kategorie-Auswahl (Dropdowns, Filter, Kategorie-Select in der Tabelle). */
export type CategoryOptionRow = {
  id: string
  name: string
  color: string | null
  icon: string | null
  parent_id: string | null
}

/** Alle Kategorien für die Verwaltungsseite (nach sort_order, dann Name). */
export async function getCategories(supabase: DB, userId: string): Promise<CategoryRow[]> {
  const { data } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return data ?? []
}

/** Kategorie-Auswahl (Name, Farbe, Icon, Eltern), nach sort_order. */
export async function getCategoryOptions(supabase: DB, userId: string): Promise<CategoryOptionRow[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name, color, icon, parent_id')
    .eq('user_id', userId)
    .order('sort_order')
  return data ?? []
}

/** Kategorien nur mit id + name, nach Name (Verträge). */
export async function getCategoryNames(supabase: DB, userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

/** Zeilen der Anlage EÜR, in die Buchungen fließen (Einnahmen/Ausgaben), jüngstes Jahr zuerst. */
export type EuerZeileRow = Pick<
  Database['public']['Tables']['euer_zeilen']['Row'],
  'jahr' | 'zeile' | 'bezeichnung' | 'art' | 'sammelzeile' | 'quelle' | 'geprueft_am'
>

export async function getEuerZeilenForCategories(supabase: DB): Promise<EuerZeileRow[]> {
  const { data } = await supabase
    .from('euer_zeilen')
    .select('jahr, zeile, bezeichnung, art, sammelzeile, quelle, geprueft_am')
    .in('art', ['einnahme', 'ausgabe'])
    .order('jahr', { ascending: false })
    .order('zeile', { ascending: true })
  return data ?? []
}
