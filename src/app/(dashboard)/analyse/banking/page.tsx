'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CreditCard, Check, ArrowUpRight, X } from 'lucide-react'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankTransactionsView } from '@/components/bank/bank-transactions-view'
import { BankCategoryChart } from '@/components/bank/bank-category-chart'
import { BankTrendChart } from '@/components/bank/bank-trend-chart'
import { BankBalanceChart } from '@/components/bank/bank-balance-chart'
import { PeriodSelector } from '@/components/ui/period-selector'
import { DEFAULT_PERIOD, parsePeriod, periodCutoff, type Period } from '@/lib/period'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { SkeletonChart, SkeletonStatCards } from '@/components/ui/skeleton'
import { useSettings } from '@/components/providers/settings-context'
import type { BankTransaction } from '@/types/bank'

/**
 * Auswertung der Bankdaten über alle Konten hinweg — Unterpunkt von Analyse.
 *
 * Lag vorher unter `/bank/auswertung`, als Banking noch ein eigener Hauptpunkt war. Der
 * Sync sitzt jetzt im Kopf von Finance/Konten (siehe BankSyncPanel), und was hier übrig
 * ist, ist eine Auswertung — also gehört sie neben die andere. Die alte URL leitet weiter
 * (next.config.ts).
 *
 * Der Unterschied zur Übersicht unter `/analyse` ist die Datenquelle, und der ist der
 * Grund, warum es beide gibt: dort läuft alles über `unified_transactions`, also
 * Bankbuchungen UND manuelle Einträge, umgerechnet und kategorisiert. Hier ausschließlich
 * die gesyncten Rohdaten, Konto für Konto, so wie die Bank sie geliefert hat — die Ansicht,
 * in der man einen Importfehler überhaupt erkennen kann.
 *
 * Ergänzt die Kontodetailseite unter Finance, statt sie zu ersetzen: dort sieht man EIN
 * Konto mit seinen manuellen Buchungen, Kategorien und Verträgen; hier alle Bankkonten
 * nebeneinander.
 */

// 1W und 1M fehlen bewusst: Monatstrend und Kategorieverteilung brauchen mehrere Monate,
// um überhaupt eine Aussage zu treffen.
const BANK_PERIODS = ['3M', '6M', '1J', 'Alles'] as const

/**
 * `useSearchParams` in einer Client-Komponente MUSS in einer Suspense-Grenze haengen —
 * ohne sie bricht `next build` diese Route mit „Missing Suspense boundary with
 * useSearchParams" ab (siehe node_modules/next/dist/docs/01-app/03-api-reference/
 * 04-functions/use-search-params.md). Im Dev-Server faellt das nicht auf, weil Routen dort
 * on demand gerendert werden und der Hook gar nicht erst suspendiert.
 */
export default function BankAnalysePage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-8"><SkeletonStatCards count={3} /></div>}>
      <BankAnalyse />
    </Suspense>
  )
}

function BankAnalyse() {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const {
    transactions,
    balances,
    categories,
    isLoadingTxns,
    loaded,
    loadTransactions,
    loadBalances,
    loadCategories,
    updateCategory,
  } = useBankData()

  // Zeitraum in der URL statt in lokalem State: sonst fällt die Auswahl beim Neuladen und
  // beim Zurück-Button auf den Default zurück.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const period = parsePeriod(searchParams.get('period'))
  // Ausgewaehlter Monat als `YYYY-MM`. Wie der Zeitraum in der URL, damit ein Reload und
  // der Zurueck-Button die Auswahl behalten — und damit man einen bestimmten Monat
  // verlinken kann.
  const selectedMonth = searchParams.get('month')

  const writeParams = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const setPeriod = useCallback((next: Period) => {
    // Zeitraumwechsel hebt die Monatsauswahl auf: der gewaehlte Monat kann im neuen
    // Fenster gar nicht mehr enthalten sein, und dann stuende ein Filter aktiv, dessen
    // Saeule nirgends mehr zu sehen ist.
    writeParams({ period: next === DEFAULT_PERIOD ? null : next, month: null })
  }, [writeParams])

  const setMonth = useCallback((m: string | null) => writeParams({ month: m }), [writeParams])

  const [selectedIban, setSelectedIban] = useState<string | undefined>(undefined)
  const [txnFilters, setTxnFilters] = useState<{ q?: string; categoryId?: string }>({})

  const handleFilter = useCallback((params: { q?: string; categoryId?: string }) => {
    setTxnFilters(params)
  }, [])

  const toggleAccount = useCallback((iban: string) => {
    setSelectedIban(prev => (prev === iban ? undefined : iban))
  }, [])

  useEffect(() => {
    loadBalances()
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadTransactions({ iban: selectedIban, ...txnFilters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIban, txnFilters])

  const cutoff = periodCutoff(period)   // null bei 'Alles'

  // Umbuchungen zwischen eigenen Konten sind kein Einkommen und keine Ausgabe — ohne diese
  // Bereinigung tauchen 1.500 EUR vom Giro- aufs Gemeinschaftskonto in beiden Richtungen in
  // den Monatssummen auf, obwohl kein Geld den Haushalt verlassen hat.
  //
  // IBANs normalisiert vergleichen: FinTS liefert sie mal mit, mal ohne Leerzeichen, und ein
  // Vergleich, der daran scheitert, faellt lautlos auf „ist keine Umbuchung" zurueck.
  const normIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase()
  const ownIbans = useMemo(
    () => new Set(balances.map(b => normIban(b.account_iban))),
    [balances],
  )
  const isInternalTransfer = useCallback(
    (t: BankTransaction) => !!t.counterpart_iban && ownIbans.has(normIban(t.counterpart_iban)),
    [ownIbans],
  )

  // Der Abzug gilt AUCH bei ausgewaehltem Konto. Vorher nicht: dort zaehlte eine Umbuchung
  // als echte Einnahme bzw. Ausgabe des Kontos mit. Im August 2026 hiess das:
  //
  //   Girokonto        3.630,13 / 3.288,44  ->  angezeigt wurden 7.280,13 / 6.188,44
  //   Geteiltes Konto  2.335,00 /   935,44  ->  angezeigt wurden 5.725,00 / 5.075,44
  //
  // Alles dazwischen war nur Verschiebung zwischen den beiden eigenen Konten. Im
  // Kategoriediagramm landeten dieselben Buchungen unter der Kategorie, die ihnen jemand
  // gegeben hatte: 1.500 EUR als „Freizeit", 900 EUR als „Schulden".
  //
  // Mit dem Abzug stimmen die Summen jetzt mit /analyse ueberein (5.965,13 / 4.223,88 fuer
  // August ueber beide Konten) — dort filtert `unified_transactions` dieselben Buchungen
  // ueber `type = 'transfer'` heraus.
  //
  // Der Kontostandsverlauf bleibt davon unberuehrt — der rechnet weiter mit `transactions`,
  // denn fuer den Saldo des einzelnen Kontos ist die Umbuchung sehr wohl eine Bewegung.
  const periodTransactions = useMemo(() => {
    const inRange = cutoff ? transactions.filter(t => t.value_date >= cutoff) : transactions
    return inRange.filter(t => !isInternalTransfer(t))
  }, [transactions, cutoff, isInternalTransfer])

  // Der Monatsfilter greift auf ALLES ausser dem Monatschart selbst — der muss weiter
  // alle Monate zeigen, sonst schrumpft er beim Anklicken auf eine einzelne Saeule und
  // man kaeme nicht mehr zurueck.
  const monthTransactions = useMemo(
    () => selectedMonth
      ? periodTransactions.filter(t => t.value_date.slice(0, 7) === selectedMonth)
      : periodTransactions,
    [periodTransactions, selectedMonth],
  )

  // Die Tabelle zeigt sonst bewusst die volle Historie; bei aktivem Monat aber genau ihn.
  const tableTransactions = useMemo(
    () => selectedMonth
      ? transactions.filter(t => t.value_date.slice(0, 7) === selectedMonth)
      : transactions,
    [transactions, selectedMonth],
  )

  const monthLabel = selectedMonth
    ? new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 1)
        .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : null

  // Konten mit Bewegungen — bewusst über die volle Historie geprüft, nicht über `cutoff`:
  // ein Konto ohne Buchung im Fenster soll seinen Verlauf als flache Linie behalten und
  // nicht aus dem Raster verschwinden.
  const accountsWithHistory = useMemo(
    () => balances.filter(b => transactions.some(t => t.account_iban === b.account_iban)),
    [balances, transactions],
  )

  const showBalanceSkeleton = !loaded.balances
  const showChartSkeleton   = !loaded.balances || !loaded.transactions

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Kein Zurück-Link: der Bereich hat in der Seitenleiste Unterpunkte (Übersicht /
          Bankdaten), und die tragen die Navigation. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bankdaten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground max-w-xl">
            Alle Bankkonten auf den gesyncten Rohdaten — ohne manuelle Buchungen und ohne
            Umrechnung. Ein Klick auf eine Kontokarte beschränkt alles darunter auf dieses
            Konto.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Zeitraum
          </span>
          <PeriodSelector value={period} onSelect={setPeriod} options={BANK_PERIODS} />
        </div>
      </div>

      {/* Kontokarten — klicken filtert alles darunter */}
      {showBalanceSkeleton && <SkeletonStatCards count={3} />}

      {!showBalanceSkeleton && balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => {
            const isSelected = selectedIban === b.account_iban
            return (
              // Karte und Link nebeneinander statt ineinander: ein <a> in einem <button>
              // ist ungültiges HTML, und der Klick würde beides auslösen.
              <div
                key={b.account_iban}
                className={`relative rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleAccount(b.account_iban)}
                  aria-pressed={isSelected}
                  className="w-full text-left p-4 space-y-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2 text-muted-foreground pr-14">
                    <CreditCard className="size-4 shrink-0" />
                    <span className="text-xs font-medium truncate">{b.account_name ?? b.account_iban}</span>
                  </div>
                  <p className="font-mono text-xl font-semibold">{fmtEur(b.booked_balance)}</p>
                  {b.available_balance !== b.booked_balance && (
                    <p className="text-xs text-muted-foreground">
                      Verfügbar: {fmtEur(b.available_balance)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono">{b.account_iban}</p>
                  <p className="text-xs text-muted-foreground">
                    Stand: {fmtDate(b.fetched_at, dateFormat)}
                  </p>
                </button>

                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {isSelected && (
                    <span className="flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  )}
                  {b.account_id && (
                    <Link
                      href={`/finance/accounts/${b.account_id}`}
                      title="In Finance öffnen — Kategorien, Verträge, manuelle Buchungen"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Finance
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Kontostand-Verlauf je Konto */}
      {showChartSkeleton && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonChart key={i} variant="area" height={180} />
          ))}
        </div>
      )}

      {!showChartSkeleton && accountsWithHistory.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accountsWithHistory.map(b => (
            <BankBalanceChart
              key={b.account_iban}
              accountName={b.account_name ?? b.account_iban}
              currentBalance={b.booked_balance}
              transactions={transactions.filter(t => t.account_iban === b.account_iban)}
              from={cutoff ?? undefined}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {monthLabel && (
          // Ohne sichtbare Anzeige waere der Filter unsichtbar: man sieht nur, dass
          // ploetzlich weniger Buchungen da sind, und sucht den Grund woanders.
          <button
            type="button"
            onClick={() => setMonth(null)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground hover:bg-primary/15 transition-colors"
          >
            Nur {monthLabel}
            <X className="size-3" />
          </button>
        )}
        {/* Gilt jetzt in jeder Ansicht, auch mit ausgewaehltem Konto — deshalb ohne
            Bedingung. Der Hinweis muss stehen bleiben: sonst wundert man sich, warum die
            Summen hier nicht zu denen in der Buchungsliste darunter passen. */}
        <p className="text-xs text-muted-foreground/70">
          Umbuchungen zwischen eigenen Konten sind in den Auswertungen unten herausgerechnet —
          im Kontostandsverlauf und in der Buchungsliste stehen sie weiterhin drin.
        </p>
      </div>

      {/* Monatstrend + Kategorien */}
      {showChartSkeleton ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart variant="bars" height={220} legend />
          <SkeletonChart variant="hbars" height={220} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BankTrendChart
            transactions={periodTransactions}
            selectedMonth={selectedMonth}
            onSelectMonth={setMonth}
          />
          <BankCategoryChart transactions={monthTransactions} categories={categories} />
        </div>
      )}

      {/* Buchungen — bewusst ungefiltert vom Zeitraum: hier ist die komplette Historie
          samt Suche der Zweck. Der Monatsfilter greift dagegen sehr wohl.

          Die Ueberschrift traegt den gewaehlten Monat, obwohl derselbe Chip schon oben bei
          den Diagrammen steht: der Chart, auf den man klickt, ist einen Bildschirm weiter
          oben. Ohne Beschriftung direkt ueber der Tabelle sieht man hier nur, dass ploetzlich
          weniger Zeilen da sind, und sucht den Grund in Suche oder Kategoriefilter. */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap -mb-1">
        <h2 className="text-sm font-semibold text-foreground">
          Buchungen
          {monthLabel && (
            <span className="font-normal text-muted-foreground"> · nur {monthLabel}</span>
          )}
        </h2>
        {monthLabel && (
          <button
            type="button"
            onClick={() => setMonth(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3" />
            Monatsfilter aufheben
          </button>
        )}
      </div>

      <BankTransactionsView
        transactions={tableTransactions}
        categories={categories}
        isLoading={isLoadingTxns}
        hasLoaded={loaded.transactions}
        onFilter={handleFilter}
        onUpdateCategory={updateCategory}
        isInternalTransfer={isInternalTransfer}
      />
    </div>
  )
}
