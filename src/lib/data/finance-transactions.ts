import { mitSteuerWerten } from '@/lib/tax/overrides'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { berechneKiBilanz, type KiBilanz, type KiZeile } from '@/lib/fints/ai-bilanz'
import { OHNE_KATEGORIE, type TransaktionsFilter } from '@/lib/transaktionen/filter'
import { summiereTreffer, type TrefferSummen } from '@/lib/transaktionen/berechnen'

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

/** Filter der Transaktionen-Liste — geprüft in `parseFilter` (lib/transaktionen/filter.ts). */
export type TransactionListFilters = TransaktionsFilter

/**
 * Methoden, die `wendeFilterAn` auf dem Abfrage-Builder braucht. Als Methodensignaturen (bivariant)
 * deklariert, damit der typisierte Builder von supabase-js hineinpasst, ohne `any`.
 */
interface FilterBuilder<Q> {
  eq(spalte: string, wert: string): Q
  gte(spalte: string, wert: string | number): Q
  lte(spalte: string, wert: string | number): Q
  is(spalte: string, wert: null): Q
  in(spalte: string, werte: string[]): Q
  or(ausdruck: string): Q
}

/**
 * Wendet die Filter auf eine Abfrage der View `unified_transactions` an. EINE Stelle für Liste, Summe
 * und Export: sonst zeigt die Liste etwas anderes, als die Summe darüber addiert oder der Export schreibt.
 */
export function wendeFilterAn<Q extends FilterBuilder<Q>>(query: Q, f: TransaktionsFilter, kategorieIds?: string[]): Q {
  let q = query
  if (f.type) q = q.eq('type', f.type)
  if (f.art) q = q.eq('flow_kind', f.art)
  if (f.account) q = q.eq('account_id', f.account)
  if (f.category === OHNE_KATEGORIE) q = q.is('category_id', null)
  else if (f.category) {
    // Eine Hauptkategorie umfasst ihre Unterkategorien (wie der Rollup auf den übrigen Seiten);
    // die IDs löst `kategorieIdsFuer` vorher auf.
    q = kategorieIds && kategorieIds.length > 0 ? q.in('category_id', kategorieIds) : q.eq('category_id', f.category)
  }
  if (f.from) q = q.gte('date', f.from)
  if (f.to) q = q.lte('date', f.to)
  if (f.min !== undefined) q = q.gte('amount', f.min)
  if (f.max !== undefined) q = q.lte('amount', f.max)
  if (f.q) {
    // Kommas, Klammern und Platzhalter trennen in PostgREST die or()-Bedingungen bzw. suchen mit —
    // unmaskiert würde ein Suchbegriff mit diesen Zeichen die Query zerlegen statt gefiltert zu werden.
    const term = f.q.replace(/[,()*%_\\]/g, ' ').trim()
    if (term) q = q.or(`description.ilike.%${term}%,merchant.ilike.%${term}%`)
  }
  return q
}

const UNIFIED_BASE_COLUMNS =
  'id, account_id, category_id, date, type, amount, currency, description, merchant, transfer_to, source, signed_amount, flow_kind, category_source, ai_category_id'
const TRANSACTION_LIST_COLUMNS = `${UNIFIED_BASE_COLUMNS}, account_name, account_color`
const ACCOUNT_TRANSACTION_COLUMNS = `${UNIFIED_BASE_COLUMNS}, category_name, category_color`

/**
 * Die gewählte Kategorie samt allen Unterkategorien (aus der View `category_tree`: `root_id` ist die
 * oberste Kategorie des Astes). Der Baum gilt pro Haushalt: die RLS liefert ihn, kein Scope-Filter. Ohne Kategorie-Filter oder bei „ohne Kategorie“: `undefined`. Bei einem
 * Fehler bleibt es bei der Kategorie selbst — lieber zu eng gefiltert als eine fremde Auswahl.
 */
export async function kategorieIdsFuer(
  supabase: DB,
  f: TransaktionsFilter,
): Promise<string[] | undefined> {
  if (!f.category || f.category === OHNE_KATEGORIE) return undefined
  const { data, error } = await supabase
    .from('category_tree')
    .select('id')
    .or(`id.eq.${f.category},root_id.eq.${f.category}`)
  if (error || !data || data.length === 0) return [f.category]
  const ids = data.map((r) => r.id).filter((id): id is string => Boolean(id))
  return ids.includes(f.category) ? ids : [...ids, f.category]
}

/**
 * Eine Seite der Transaktionsliste (gefiltert, serverseitig paginiert) samt Gesamtzahl.
 * `page` ist 1-basiert. Gibt `error` zurück statt zu werfen — die Seite behandelt eine leere/
 * hinter dem Ende liegende Seite selbst.
 */
export async function getTransactionsPage(
  supabase: DB,
  ctx: ScopeContext,
  opts: { filters: TransactionListFilters; page: number; pageSize: number },
): Promise<{ rows: TransactionListRow[]; count: number | null; error: { message: string } | null }> {
  const { filters, page, pageSize } = opts

  const [feld, richtung] = filters.sort.split('-')
  const aufsteigend = richtung === 'asc'
  const kategorieIds = await kategorieIdsFuer(supabase, filters)

  // Zweites Sortierkriterium: `date` ist ein Datum, kein Zeitstempel. Ohne eindeutige Ordnung (`id`)
  // wäre die Seiteneinteilung nicht stabil (Buchung auf zwei Seiten / auf keiner). Nach Betrag zuerst
  // der Betrag, dann das Datum — gleiche Beträge erscheinen in zeitlicher Reihenfolge.
  // TODO(scope-flows): Herabstufung per counterpart_account_id (flow_kind der Liste ist haushaltsweit)
  let query = wendeFilterAn(
    applyAccountScope(
      supabase.from('unified_transactions').select(TRANSACTION_LIST_COLUMNS, { count: 'exact' }),
      ctx,
    ),
    filters,
    kategorieIds,
  )
  if (feld === 'amount') query = query.order('amount', { ascending: aufsteigend }).order('date', { ascending: false })
  else query = query.order('date', { ascending: aufsteigend })
  query = query.order('id', { ascending: aufsteigend })

  const von = (page - 1) * pageSize
  const { data, count, error } = await query.range(von, von + pageSize - 1)

  return {
    rows: (data ?? []) as unknown as TransactionListRow[],
    count,
    error,
  }
}

/**
 * Summen über ALLE Treffer eines Filters (nicht nur die angezeigte Seite). Liest nur die vier Spalten,
 * die die Summe braucht, seitenweise (PostgREST kappt eine Antwort still bei 1.000 Zeilen).
 *
 * Gedeckelt bei 20.000 Zeilen: bei dieser Größenordnung wäre eine Summe in der Datenbank (RPC) die
 * richtige Lösung; `gekappt` sagt der Seite, dass die Summe dann unvollständig ist.
 */
const SUMMEN_SEITE = 1000
const SUMMEN_MAX_SEITEN = 20

export async function getTransactionsSummary(
  supabase: DB,
  ctx: ScopeContext,
  filters: TransaktionsFilter,
): Promise<TrefferSummen & { gekappt: boolean }> {
  const zeilen: { type: string; flow_kind: string; amount: number; signed_amount: number }[] = []
  let gekappt = false
  const kategorieIds = await kategorieIdsFuer(supabase, filters)
  for (let seite = 0; seite < SUMMEN_MAX_SEITEN; seite++) {
    // TODO(scope-flows): Herabstufung per counterpart_account_id
    const { data, error } = await wendeFilterAn(
      applyAccountScope(supabase.from('unified_transactions').select('type, flow_kind, amount, signed_amount'), ctx),
      filters,
      kategorieIds,
    )
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(seite * SUMMEN_SEITE, seite * SUMMEN_SEITE + SUMMEN_SEITE - 1)
    // Ein Fehler auf einer späteren Seite heißt: die Summe ist unvollständig — nicht stillschweigend zu niedrig.
    if (error) {
      gekappt = true
      break
    }
    if (!data || data.length === 0) break
    zeilen.push(...(data as unknown as typeof zeilen))
    if (data.length < SUMMEN_SEITE) break
    if (seite === SUMMEN_MAX_SEITEN - 1) gekappt = true
  }
  return { ...summiereTreffer(zeilen), gekappt }
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
  ctx: ScopeContext,
  accountId: string,
): Promise<AccountTransactionRow[]> {
  const rows: AccountTransactionRow[] = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    // TODO(scope-flows): Herabstufung per counterpart_account_id
    const { data } = await applyAccountScope(
      supabase.from('unified_transactions').select(ACCOUNT_TRANSACTION_COLUMNS),
      ctx,
    )
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
export async function getContractTransactions(supabase: DB, contractId: string) {
  // Gezielt per Vertrags-ID (Haushaltsvertrag); die RLS begrenzt auf den Haushalt, kein Konten-Scope
  // (Buchungen ohne Konto blieben sonst unsichtbar).
  const { data } = await supabase
    .from('transactions')
    .select('id, date, description, amount, currency, type')
    .eq('contract_id', contractId)
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

/** Kategorienbaum pro Haushalt: die RLS liefert ihn, deshalb kein user_id-/Scope-Filter (Eric ohne Partner: unveraendert nur seine). */
/** Alle Kategorien für die Verwaltungsseite (nach sort_order, dann Name). */
export async function getCategories(supabase: DB, userId: string): Promise<CategoryRow[]> {
  const { data } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  // Steuerwerte (Rolle, EUeR-Zeile, betrieblicher Anteil) sind persoenlich: Overrides des Nutzers statt der geteilten Spalten.
  return mitSteuerWerten(supabase, userId, data ?? [])
}

/** Kategorie-Auswahl (Name, Farbe, Icon, Eltern), nach sort_order. */
export async function getCategoryOptions(supabase: DB): Promise<CategoryOptionRow[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name, color, icon, parent_id')
    .order('sort_order')
  return data ?? []
}

/** Kategorien nur mit id + name, nach Name (Verträge). */
export async function getCategoryNames(supabase: DB): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name')
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

/**
 * Trefferquote der KI-Kategorisierung (siehe lib/fints/ai-bilanz.ts). Seitenweise gelesen, weil PostgREST bei 1.000
 * Zeilen still kappt; gelesen werden nur Zeilen, zu denen die KI überhaupt etwas gesagt hat.
 */
export async function getKiBilanz(supabase: DB, ctx: ScopeContext): Promise<KiBilanz> {
  const zeilen: KiZeile[] = []
  for (let seite = 0; seite < 20; seite++) {
    // bank_transactions hat keine account_id: Scope ueber die IBAN der Scope-Konten.
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('category_id, category_source, ai_category_id')
      .in('account_iban', ctx.ibans)
      .not('ai_category_id', 'is', null)
      .order('id', { ascending: true })
      .range(seite * 1000, seite * 1000 + 999)
    if (error || !data) break
    zeilen.push(...data)
    if (data.length < 1000) break
  }
  return berechneKiBilanz(zeilen)
}
