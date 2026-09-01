import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { AddTransactionDialog, EditTransactionDialog, DeleteTransactionButton, TransactionCategorySelect } from '@/components/finance/transaction-form'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { ExportTransactionsButton } from '@/components/finance/transaction-csv'
import { Database } from '@/types/database'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDateShort } from '@/lib/format'
import { Landmark } from 'lucide-react'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPagination } from '@/components/ui/url-pagination'
import { parsePage, parsePageSize } from '@/lib/pagination'
import { CategorySuggestionsPanel } from '@/components/bank/category-suggestions-panel'

type TxRow = Database['public']['Tables']['transactions']['Row']
type Account = { id: string; name: string; color: string | null; currency: string }
type Category = { id: string; name: string; color: string | null; icon: string | null }

// Row shape of the `unified_transactions` view (see migration 20260821010000) — merges the
// manual `transactions` ledger with FinTS-synced `bank_transactions` for any linked account,
// so this page doesn't need a second query path for Banking data.
type UnifiedRow = {
  id: string
  account_id: string | null
  account_name: string | null
  account_color: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  date: string
  type: string
  amount: number
  amount_base: number | null
  fx_rate: number
  currency: string
  description: string | null
  merchant: string | null
  transfer_to: string | null
  contract_id: string | null
  tags: string[]
  source: 'manual' | 'bank_sync'
}

interface PageProps {
  searchParams: Promise<{
    type?: string
    account?: string
    category?: string
    from?: string
    to?: string
    q?: string
    page?: string
    per?: string
  }>
}

/*
 * Zur Seiteneinteilung: vorher wurden 500 Zeilen auf einmal geholt UND gerendert. Der
 * Flaschenhals war dabei nicht die Abfrage, sondern die Tabelle — jede Zeile bringt drei
 * Client-Komponenten mit (Kategorie-Auswahl, Bearbeiten-Dialog, Löschen-Knopf). Bei 500
 * Zeilen sind das 1.500 interaktive Inseln, die hydriert werden müssen, bevor die Seite auf
 * Klicks reagiert.
 *
 * Die Seitengröße ist deshalb eine Grenze für den DOM, nicht fürs Netz — und sie bleibt
 * konstant, egal wie lang der Verlauf wird. Genau das kann eine wachsende Liste („mehr
 * anzeigen", unendliches Scrollen) nicht: dort ist man nach zehn Klicks wieder bei 500.
 *
 * Werte und Grenzen stehen in `lib/pagination`, weil die Blätterleiste im Browser dieselben
 * braucht.
 */


function formatAmount(amount: number, currency: string, type: string, locale: string) {
  // net = financial impact on the account (+income, -expense). Negative amounts flip the direction.
  const net = type === 'income' ? amount : type === 'expense' ? -amount : amount
  const sign = net > 0 ? '+' : net < 0 ? '-' : ''
  const display = ['BTC', 'ETH'].includes(currency)
    ? `${Math.abs(amount).toFixed(6)} ${currency}`
    : fmtCurrency(Math.abs(amount), currency, locale, { fractionDigits: 2 })
  return { sign, display, net }
}

function formatDate(dateStr: string, dateFormat: string) {
  return fmtDateShort(dateStr, dateFormat)
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const [filters, supabase] = await Promise.all([searchParams, createClient()])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Load accounts + categories for dropdowns and filter bar
  const [{ data: accounts }, { data: categories }, settings] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, color, currency')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, name, color, icon')
      .eq('user_id', user!.id)
      .order('sort_order'),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  // Build transactions query with optional filters — reads the unified view (manual +
  // bank-synced) instead of the raw `transactions` table.
  //
  // `count: 'exact'` liefert die Gesamtzahl der Treffer in derselben Anfrage. Vorher wurde
  // eine Zeile mehr als das Limit geholt, um „es gibt noch mehr" zu erkennen — fuer einen
  // Blaetterer reicht das nicht, der braucht die Seitenanzahl. Bei dieser Groessenordnung
  // (einige Tausend Zeilen) ist der Zaehlvorgang nicht messbar; erst bei Hunderttausenden
  // waere `'planned'` die richtige Wahl.
  const page = parsePage(filters.page)
  const pageSize = parsePageSize(filters.per)

  let query = supabase
    .from('unified_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    // Zweites Sortierkriterium, und ohne das waere die Seiteneinteilung schlicht falsch:
    // `date` ist kein Zeitstempel, sondern ein Datum, und an einem Tag liegen oft ein
    // Dutzend Buchungen. Bei mehrdeutiger Sortierung darf Postgres die Reihenfolge je
    // Abfrage anders waehlen — dieselbe Buchung erschiene dann auf zwei Seiten und eine
    // andere auf keiner. `id` ist eindeutig und macht die Ordnung stabil.
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
  const { data: transactions, count, error } = await query.range(von, von + pageSize - 1)

  const rows = (transactions ?? []) as UnifiedRow[]
  const total = count ?? rows.length
  // `page`/`per` sind Ansichtseinstellungen, keine Filter — sonst stünde bei „100 pro
  // Seite" dauerhaft „(gefiltert)" hinter der Anzahl.
  const hasFilters = Object.entries(filters).some(
    ([key, value]) => key !== 'page' && key !== 'per' && value,
  )

  // Von Hand eingetippte oder veraltete Seitenzahl (ein Lesezeichen auf Seite 12, waehrend
  // inzwischen gefiltert wird). PostgREST antwortet auf einen Bereich hinter dem Ende je
  // nach Version mit einer leeren Liste oder mit 416 — beides landet hier.
  const seiteLeer = page > 1 && rows.length === 0 && (total > 0 || !!error)

  return (
    <div className="p-4 sm:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transaktionen</h1>
          {/* Die Gesamtzahl, nicht die der angezeigten Zeilen: sonst stuende auf jeder Seite
              „50 Eintraege" und der Verlauf saehe abgeschnitten aus. Wie viel davon gerade
              zu sehen ist, sagt die Blaetterleiste unter der Tabelle. */}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} {total === 1 ? 'Eintrag' : 'Einträge'}
            {hasFilters && ' (gefiltert)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Kategorie-Vorschläge für frisch gesyncte Bankbuchungen. Lag vorher auf der
              Banking-Seite, schreibt aber Buchungen — und die stehen hier. */}
          <CategorySuggestionsPanel />
          <ExportTransactionsButton />
          <AddTransactionDialog
            accounts={accounts ?? []}
            categories={categories ?? []}
          />
        </div>
      </div>

      {/* Filters — `replace`, damit der Zurück-Button nicht durch jeden Filterschritt
          zurücklaeuft; der Provider markiert die Auswahl sofort und blendet die Tabelle
          ab, solange der Server die gefilterte Liste rendert.
          `resetKeys="page"`: jede Filteraenderung springt zurueck auf Seite 1 — Filter auf
          Seite 7 zu setzen fuehrt sonst regelmaessig auf eine leere Seite. */}
      <Suspense fallback={<div className="h-8" />}>
        <UrlFiltersProvider replace resetKeys="page">
          <div className="space-y-5">
            <TransactionFilters
              accounts={accounts ?? []}
              categories={categories ?? []}
            />

            <FilterPending className="space-y-4">
              {rows.length === 0 ? (
                seiteLeer ? <OutOfRange /> : <EmptyState hasFilters={hasFilters} />
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Datum</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Konto</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Kategorie</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Beschreibung</th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
                          <th className="px-4 py-3 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((tx) => (
                          <TransactionRow key={tx.id} tx={tx} accounts={accounts ?? []} categories={categories ?? []} locale={locale} dateFormat={dateFormat} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Innerhalb von `FilterPending`: beim Blaettern soll dieselbe Rueckmeldung
                      kommen wie beim Filtern — Balken oben, Inhalt abgeblendet — und der
                      Blaetterer waehrenddessen keine zweite Navigation annehmen. */}
                  <UrlPagination page={page} pageSize={pageSize} total={total} />
                </>
              )}
            </FilterPending>
          </div>
        </UrlFiltersProvider>
      </Suspense>
    </div>
  )
}

function TransactionRow({ tx, accounts, categories, locale, dateFormat }: { tx: UnifiedRow; accounts: Account[]; categories: Category[]; locale: string; dateFormat: string }) {
  const { sign, display, net } = formatAmount(tx.amount, tx.currency, tx.type, locale)

  const amountColor =
    net > 0 ? 'text-success'
    : net < 0 ? 'text-danger'
    : 'text-foreground'

  return (
    <tr className="group hover:bg-muted/30 transition-colors">
      {/* Datum */}
      <td className="px-4 py-3 text-muted-foreground tabular-nums">
        {formatDate(tx.date, dateFormat)}
      </td>

      {/* Konto */}
      <td className="px-4 py-3">
        {tx.account_name ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: tx.account_color ?? '#94a3b8' }}
            />
            <span className="text-muted-foreground">{tx.account_name}</span>
            {tx.type === 'transfer' && (
              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Transfer
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Kategorie — inline, optimistisches Select statt Textanzeige */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <TransactionCategorySelect
          tx={{ id: tx.id, category_id: tx.category_id, source: tx.source }}
          categories={categories}
        />
      </td>

      {/* Beschreibung / Händler */}
      <td className="px-4 py-3 max-w-xs hidden md:table-cell">
        <span className="truncate block text-foreground">
          {tx.merchant || tx.description || <span className="text-muted-foreground">—</span>}
        </span>
        {tx.merchant && tx.description && (
          <span className="text-xs text-muted-foreground truncate block">{tx.description}</span>
        )}
      </td>

      {/* Betrag */}
      <td className={`px-4 py-3 text-right font-medium tabular-nums ${amountColor}`}>
        {sign}{display}
      </td>

      {/* Aktionen — Bank-synchte Zeilen sind nicht editierbar/löschbar, die Bank ist hier die
          Quelle der Wahrheit. Kategorisieren geht trotzdem: über die Auswahl in der Spalte
          Kategorie und gesammelt über „Kategorien vorschlagen" oben. */}
      <td className="px-2 py-3">
        {tx.source === 'bank_sync' ? (
          <span className="flex items-center justify-end" title="Automatisch aus Banking synchronisiert">
            <Landmark className="size-3.5 text-muted-foreground" />
          </span>
        ) : (
          <span className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <EditTransactionDialog tx={tx as unknown as TxRow} accounts={accounts} categories={categories} />
            <DeleteTransactionButton tx={tx as unknown as TxRow} />
          </span>
        )}
      </td>
    </tr>
  )
}

/** Seitenzahl hinter dem Ende der Liste — siehe `seiteLeer`. */
function OutOfRange() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Diese Seite gibt es nicht</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Die Liste ist inzwischen kürzer — zurück zum{' '}
        <a href="/finance/transactions" className="text-primary hover:underline">
          Anfang
        </a>
        .
      </p>
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? 'Keine Treffer für diese Filter' : 'Noch keine Transaktionen'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters
          ? 'Passe die Filter an oder setze sie zurück.'
          : 'Erfasse deine erste Transaktion.'}
      </p>
    </div>
  )
}
