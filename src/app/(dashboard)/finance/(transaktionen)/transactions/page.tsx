import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { applyAccountScope } from '@/lib/haushalt/scope'
import { AddTransactionDialog } from '@/components/finance/transaction-form'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { ExportTransactionsButton, ImportTransactionsChooser } from '@/components/finance/transaction-csv'
import {
  getTransactionsPage,
  getTransactionsSummary,
  getCategoryOptions,
  getKiBilanz,
} from '@/lib/data/finance-transactions'
import { getActiveAccountOptions } from '@/lib/data/finance-accounts'
import { getActiveDebts } from '@/lib/data/finance-planning'
import { getSettings } from '@/lib/settings'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPagination } from '@/components/ui/url-pagination'
import { parsePage, parsePageSize } from '@/lib/pagination'
import { CategorySuggestionsPanel } from '@/components/bank/category-suggestions-panel'
import { filterAktiv, filterAlsParameter, parseFilter, type RohFilter } from '@/lib/transaktionen/filter'
import { AuswahlKnopf, AuswahlProvider } from '@/components/transaktionen/AuswahlProvider'
import { FilterZuruecksetzen } from '@/components/transaktionen/FilterZuruecksetzen'
import { KiChip } from '@/components/transaktionen/KiChip'
import { TransaktionenKennzahlen } from '@/components/transaktionen/TransaktionenKennzahlen'
import { TransaktionenListe } from '@/components/transaktionen/TransaktionenListe'
import { Receipt } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'

export const dynamic = 'force-dynamic'

type SearchParams = RohFilter & { page?: string; per?: string }

/*
 * Zur Seiteneinteilung: vorher wurden 500 Zeilen auf einmal geholt UND gerendert. Der Flaschenhals war
 * dabei nicht die Abfrage, sondern die Liste — jede Zeile bringt interaktive Inseln mit (Kategorie-
 * Auswahl, Bearbeiten-Dialog, Löschen-Knopf). Die Seitengröße ist deshalb eine Grenze für den DOM, nicht
 * fürs Netz — und sie bleibt konstant, egal wie lang der Verlauf wird. Werte und Grenzen: `lib/pagination`.
 */

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, { supabase, user }] = await Promise.all([searchParams, requireAuthUser()])
  const ctx = await resolveScope(supabase, user!)
  const filter = parseFilter(sp)
  const page = parsePage(sp.page)
  const pageSize = parsePageSize(sp.per)
  const hasFilters = filterAktiv(filter)
  // Berliner Datum, nie toISOString (UTC liefert nach Mitternacht noch den Vortag).
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())

  const [accounts, categories, debts, settings, kiBilanz, seite, summen, gesamt] = await Promise.all([
    getActiveAccountOptions(supabase, ctx),
    getCategoryOptions(supabase),
    // Für den Schulden-Vorschlag (DebtSuggestion): nur aktive, nicht abgeschlossene Schulden.
    getActiveDebts(supabase, ctx),
    getSettings(user!.id),
    getKiBilanz(supabase, ctx),
    getTransactionsPage(supabase, ctx, { filters: filter, page, pageSize }),
    getTransactionsSummary(supabase, ctx, filter),
    // Gesamtzahl ohne Filter nur, wenn gefiltert wird („41 von 729“).
    hasFilters
      ? applyAccountScope(supabase.from('unified_transactions').select('id', { count: 'exact', head: true }), ctx).then(r => r.count)
      : Promise.resolve(null),
  ])

  const { rows, count, error } = seite
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'
  const schuldenCategoryId = categories.find(c => c.name === 'Schulden')?.id ?? null
  const total = count ?? rows.length

  // Von Hand eingetippte oder veraltete Seitenzahl (Lesezeichen auf Seite 12, inzwischen gefiltert).
  // PostgREST antwortet hinter dem Ende je nach Version mit leerer Liste oder 416 — beides landet hier.
  const seiteLeer = page > 1 && rows.length === 0 && (total > 0 || !!error)

  // Wirklich nichts da (kein Filter, erste Seite, kein Fehler): Filterleiste und Kennzahlen mit Nullen entfallen.
  const ganzLeer = rows.length === 0 && !hasFilters && page <= 1 && !error && total === 0

  const eintraege = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`

  return (
    <AuswahlProvider>
      <div className="space-y-4 p-4 sm:p-8">
        {/* Kopf: Titel, eine Zeile Anzahl + KI-Chip, Aktionen */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Transaktionen</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-muted-foreground">
                {hasFilters && gesamt !== null ? `${total} von ${eintraege(gesamt)}` : eintraege(total)}
                {hasFilters && gesamt === null && ' (gefiltert)'}
              </p>
              <KiChip bilanz={kiBilanz} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="w-full sm:order-last sm:w-auto [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-8 sm:[&>button]:w-auto">
              <AddTransactionDialog
                accounts={accounts}
                categories={categories}
                debts={debts}
                schuldenCategoryId={schuldenCategoryId}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 max-sm:[&_button]:h-10">
              {/* Kategorie-Vorschläge für frisch gesyncte Bankbuchungen: schreibt Buchungen, gehört hierher. */}
              <CategorySuggestionsPanel />
              <AuswahlKnopf />
              <ExportTransactionsButton params={filterAlsParameter(filter)} />
              <ImportTransactionsChooser accounts={accounts} />
            </div>
          </div>
        </div>

        {/* `replace`: der Zurück-Knopf läuft nicht durch jeden Filterschritt. `resetKeys="page"`: jede
            Filteränderung springt auf Seite 1 (Filter auf Seite 7 führt sonst oft auf eine leere Seite). */}
        {ganzLeer ? (
          <div className="space-y-4">
            <ScopeHinweisFuer ctx={ctx} thema="Buchungen" />
            {accounts.length === 0 ? (
              <LeerZustand
                icon={Receipt}
                titel="Noch keine Transaktionen"
                text="Buchungen gehören zu einem Konto. Lege zuerst ein Konto an oder verbinde deine Bank; danach kannst du Buchungen erfassen, per CSV importieren oder synchronisieren."
                aktion={{ label: 'Konto anlegen', href: '/finance/accounts' }}
                sekundaer={{ label: 'Bank verbinden', href: '/settings' }}
              />
            ) : (
              <LeerZustand
                icon={Receipt}
                titel="Noch keine Transaktionen"
                text="Hier erscheinen alle Buchungen deiner Konten, mit Filtern, Kategorien und Sammelaktionen. Erfasse die erste Buchung, importiere eine CSV oder synchronisiere deine Bank."
                aktionNode={
                  <AddTransactionDialog
                    accounts={accounts}
                    categories={categories}
                    debts={debts}
                    schuldenCategoryId={schuldenCategoryId}
                  />
                }
                sekundaer={{ label: 'Bank verbinden', href: '/settings' }}
              />
            )}
          </div>
        ) : (
        <Suspense fallback={<div className="h-8" />}>
          <UrlFiltersProvider replace resetKeys="page">
            <div className="space-y-4">
              <TransactionFilters accounts={accounts} categories={categories} heute={heute} />

              <FilterPending className="space-y-4">
                <TransaktionenKennzahlen summen={summen} gefiltert={hasFilters} locale={locale} />

                {rows.length === 0 ? (
                  seiteLeer ? <OutOfRange /> : <EmptyState hasFilters={hasFilters} />
                ) : (
                  <>
                    <TransaktionenListe
                      rows={rows}
                      accounts={accounts}
                      categories={categories}
                      debts={debts}
                      schuldenCategoryId={schuldenCategoryId}
                      locale={locale}
                      dateFormat={dateFormat}
                      heute={heute}
                      sort={filter.sort}
                      suche={filter.q}
                      geteilteTage={{ anfang: page > 1, ende: page * pageSize < total }}
                    />
                    {/* Innerhalb von `FilterPending`: beim Blättern dieselbe Rückmeldung wie beim Filtern. */}
                    <UrlPagination page={page} pageSize={pageSize} total={total} />
                  </>
                )}
              </FilterPending>
            </div>
          </UrlFiltersProvider>
        </Suspense>
        )}
      </div>
    </AuswahlProvider>
  )
}

/** Seitenzahl hinter dem Ende der Liste — siehe `seiteLeer`. */
function OutOfRange() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
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
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? 'Keine Treffer für diese Filter' : 'Noch keine Transaktionen'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters
          ? 'Passe die Filter an oder setze sie zurück.'
          : 'Erfasse deine erste Transaktion oder importiere eine CSV.'}
      </p>
      {hasFilters && <FilterZuruecksetzen />}
    </div>
  )
}
