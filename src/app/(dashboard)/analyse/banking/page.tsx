'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CreditCard, Check, ArrowUpRight, X } from 'lucide-react'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankTransactionsView } from '@/components/bank/bank-transactions-view'
import { BankSyncButton } from '@/components/bank/bank-sync-button'
import { BankCategoryChart } from '@/components/bank/bank-category-chart'
import { BankTrendChart } from '@/components/bank/bank-trend-chart'
import { BankBalanceChart } from '@/components/bank/bank-balance-chart'
import { PeriodSelector } from '@/components/ui/period-selector'
import { FlowKindToggle } from '@/components/finance/flow-kind-toggle'
import { UrlFiltersProvider } from '@/components/providers/url-filters'
import { INCLUDE_PARAM, includeFromParam, monthlySeries, type FlowRow } from '@/lib/finance/flow-calc'
import { DEFAULT_PERIOD, parsePeriod, periodCutoff, ymd, type Period } from '@/lib/period'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { SkeletonChart, SkeletonStatCards } from '@/components/ui/skeleton'
import { useSettings } from '@/components/providers/settings-context'
import type { BankTransaction } from '@/types/bank'

/**
 * Auswertung der Bankdaten über alle Konten hinweg — Unterpunkt von Analyse.
 *
 * Lag vorher unter `/bank/auswertung`, als Banking noch ein eigener Hauptpunkt war. Der
 * Der Sync sitzt im Kopf von Finance/Konten (siehe BankSyncPanel) und zusätzlich hier, und was hier sonst übrig
 * ist, ist eine Auswertung — also gehört sie neben die andere. Die alte URL leitet weiter
 * (next.config.ts).
 *
 * Auch hier gibt es den Sync-Knopf (BankSyncButton), derselbe wie unter Finance/Konten; nach einem Sync lädt die Seite Salden, Buchungen
 * und Monatssummen neu.
 *
 * Der Unterschied zur Übersicht unter `/analyse` ist der Ausschnitt, und der ist der Grund,
 * warum es beide gibt: dort zählen Bankbuchungen UND manuelle Einträge, hier nur die
 * gesyncten Bankbuchungen, Konto für Konto. Die Auswertungen (Monatstrend, Kategorien)
 * rechnen nach derselben Regel wie Dashboard und Analyse (View `monthly_flows`); nur die
 * Buchungsliste und die Kontostandskurven bleiben auf den Rohdaten, so wie die Bank sie
 * geliefert hat — die Ansicht, in der man einen Importfehler überhaupt erkennen kann.
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
      <UrlFiltersProvider replace>
        <BankAnalyse />
      </UrlFiltersProvider>
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
    syncStatus,
    startSync,
    resetSync,
    scaStatus,
    loadScaStatus,
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

  // Auswertungs-Zeilen aus monthly_flows (nur Bankbuchungen). Alle Arten kommen an; ob
  // Anlagen und Forderungen mitzählen, entscheidet der Schalter (URL-Parameter `anlage`).
  const { flowDefault } = useSettings()
  const include = includeFromParam(searchParams.get(INCLUDE_PARAM), flowDefault)
  const [flowRows, setFlowRows] = useState<(FlowRow & { month: string; account_id: string | null })[]>([])
  const [flowsLoaded, setFlowsLoaded] = useState(false)
  // Zählt hoch, wenn ein Sync fertig ist: die Monatssummen kommen über eine eigene Route und müssen dann neu geholt werden.
  const [flowsVersion, setFlowsVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/finance/flows?source=bank_sync')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows?: (FlowRow & { month: string; account_id: string | null })[] }) => {
        if (!cancelled) { setFlowRows(d.rows ?? []); setFlowsLoaded(true) }
      })
      .catch(() => { if (!cancelled) setFlowsLoaded(true) })
    return () => { cancelled = true }
  }, [flowsVersion])
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
    loadScaStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nach einem erfolgreichen Sync alles neu laden, was auf dieser Seite steht: Salden, Buchungsliste (mit den aktuellen
  // Filtern) und die Monatssummen. Der Sync selbst (Knopf oben) ist derselbe wie unter Finance -> Konten.
  useEffect(() => {
    if (syncStatus.type !== 'success') return
    loadBalances()
    loadTransactions({ iban: selectedIban, ...txnFilters })
    setFlowsVersion(v => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

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

  // Auswertungen: Zeilen aus `monthly_flows` (Bankbuchungen), eingegrenzt auf Zeitraum und das
  // gewählte Konto. Umbuchungen zwischen eigenen Konten fehlen dort grundsätzlich — dieselbe
  // Regel wie auf Dashboard und /analyse, sie wird nicht mehr im Browser nachgebaut.
  // Der Zeitraum greift auf Monatsebene (ganzer Monat ab dem Monat des Cutoffs).
  // Der Kontostandsverlauf und die Buchungsliste rechnen weiter mit den Rohbuchungen
  // (`transactions`): für den Saldo eines einzelnen Kontos ist die Umbuchung sehr wohl eine
  // Bewegung.
  const selectedAccountId = selectedIban
    ? balances.find(b => b.account_iban === selectedIban)?.account_id ?? null
    : null
  const periodFlowRows = useMemo(() => {
    const fromMonth = cutoff ? cutoff.slice(0, 7) + '-01' : null
    const thisMonth = ymd(new Date()).slice(0, 7) + '-01'
    return flowRows.filter(r =>
      (!fromMonth || r.month >= fromMonth) &&
      r.month <= thisMonth && // keine Zukunftsmonate im Trend
      (!selectedIban || (selectedAccountId !== null && r.account_id === selectedAccountId)),
    )
  }, [flowRows, cutoff, selectedIban, selectedAccountId])

  const trendMonths = useMemo(
    () => monthlySeries(periodFlowRows, include).map(m => ({ month: m.month, income: m.income, expense: m.expense })),
    [periodFlowRows, include],
  )

  // Der Monatsfilter greift auf ALLES ausser dem Monatschart selbst — der muss weiter
  // alle Monate zeigen, sonst schrumpft er beim Anklicken auf eine einzelne Saeule und
  // man kaeme nicht mehr zurueck.
  const monthFlowRows = useMemo(
    () => selectedMonth
      ? periodFlowRows.filter(r => r.month.slice(0, 7) === selectedMonth)
      : periodFlowRows,
    [periodFlowRows, selectedMonth],
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
  const showChartSkeleton   = !loaded.balances || !loaded.transactions || !flowsLoaded

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Kein Zurück-Link: der Bereich hat in der Seitenleiste Unterpunkte (Übersicht /
          Bankdaten), und die tragen die Navigation. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bankdaten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground max-w-xl">
            Alle Bankkonten auf den gesyncten Bankbuchungen — ohne manuelle Buchungen. Ein Klick auf eine Kontokarte beschränkt alles darunter auf dieses
            Konto.
          </p>
        </div>
        <div className="flex items-start gap-4 flex-wrap justify-end">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Zeitraum
            </span>
            <PeriodSelector value={period} onSelect={setPeriod} options={BANK_PERIODS} />
          </div>
          {/* Derselbe FinTS-Sync wie unter Finance -> Konten (gleiche Routen, gleicher Freigabe-Hinweis). */}
          <BankSyncButton
            syncStatus={syncStatus}
            onSync={() => startSync()}
            onSyncFull={() => startSync(undefined, undefined, { fullHistory: true })}
            onReset={resetSync}
            scaStatus={scaStatus}
          />
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
                  <p className="font-mono text-xl font-semibold tabular-nums">{fmtEur(b.booked_balance)}</p>
                  {b.available_balance !== b.booked_balance && (
                    <p className="text-xs text-muted-foreground">
                      Verfügbar: <span className="tabular-nums">{fmtEur(b.available_balance)}</span>
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
        <FlowKindToggle />
        <p className="text-xs text-muted-foreground/70">
          Die Auswertungen zählen wie Dashboard und Analyse: ohne Umbuchungen zwischen eigenen
          Konten, Anlagen und Forderungen nur mit dem Schalter. Im Kontostandsverlauf und in der
          Buchungsliste stehen alle Bankbuchungen.
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
            months={trendMonths}
            selectedMonth={selectedMonth}
            onSelectMonth={setMonth}
          />
          <BankCategoryChart rows={monthFlowRows} include={include} categories={categories} />
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
