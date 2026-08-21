'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Landmark, CreditCard, Check } from 'lucide-react'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankSyncButton } from '@/components/bank/bank-sync-button'
import { CategorySuggestions } from '@/components/bank/category-suggestions'
import { BankTransactionsView } from '@/components/bank/bank-transactions-view'
import { BankCategoryChart } from '@/components/bank/bank-category-chart'
import { BankTrendChart } from '@/components/bank/bank-trend-chart'
import { BankBalanceChart } from '@/components/bank/bank-balance-chart'
import { SyncedHoldingsCard } from '@/components/bank/synced-holdings-card'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useSettings } from '@/components/providers/settings-context'
import type { BankTransaction } from '@/types/bank'

// Scopes the trend/category charts (and the totals shown in BankTrendChart's own header) to
// a window, same idea as the Analyse page's period selector. Sync now defaults to full
// history (see the note in the header below), so without this the trend chart would keep
// stacking bars/categories from years of data by default — the balance-history chart and the
// transaction table stay unfiltered on purpose, since "full account history" is exactly what
// they're for.
const PERIODS = ['3M', '6M', '1J', 'Alles'] as const
type Period = typeof PERIODS[number]

function periodCutoff(period: Period): string {
  const d = new Date()
  if (period === '3M') d.setMonth(d.getMonth() - 3)
  else if (period === '6M') d.setMonth(d.getMonth() - 6)
  else if (period === '1J') d.setFullYear(d.getFullYear() - 1)
  else return '2000-01-01'
  return d.toISOString().slice(0, 10)
}

export default function BankPage() {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const {
    transactions,
    balances,
    holdings,
    categories,
    syncStatus,
    isLoadingTxns,
    startSync,
    loadTransactions,
    loadBalances,
    loadHoldings,
    loadCategories,
    updateCategory,
    resetSync,
  } = useBankData()

  // Account filter (click a balance card to narrow everything below to that IBAN)
  const [selectedIban, setSelectedIban] = useState<string | undefined>(undefined)
  // Free-text / category filter from the transactions table's filter bar
  const [txnFilters, setTxnFilters] = useState<{ q?: string; categoryId?: string }>({})
  // Zeitraum for the trend/category charts (see PERIODS comment above)
  const [period, setPeriod] = useState<Period>('6M')

  const handleFilter = useCallback((params: { q?: string; categoryId?: string }) => {
    setTxnFilters(params)
  }, [])

  const toggleAccount = useCallback((iban: string) => {
    setSelectedIban(prev => prev === iban ? undefined : iban)
  }, [])

  // Balances are always visible — load once on mount
  useEffect(() => {
    loadBalances()
    loadHoldings()
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload transactions whenever the account or table filters change (covers initial load too)
  useEffect(() => {
    loadTransactions({ iban: selectedIban, ...txnFilters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIban, txnFilters])

  // After a successful sync, reload everything
  useEffect(() => {
    if (syncStatus.type === 'success') {
      loadTransactions({ iban: selectedIban, ...txnFilters })
      loadBalances()
      loadHoldings()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

  // Transactions scoped to the selected Zeitraum — the balance-history chart and the
  // transaction table below intentionally keep using the unfiltered `transactions`.
  const cutoff = periodCutoff(period)

  // A transfer between two of Eric's own accounts (e.g. Girokonto → Tagesgeld) posts as two
  // legs — a debit on one account's statement, a matching credit on the other's. Viewed per
  // account that's a real movement and stays in. But Trend/Category below sum income and
  // expense separately rather than netting them, so in the "alle Konten" combined view the
  // same transfer inflates both the income bar and the expense bar by the same amount even
  // though no money actually left the household — that's what made August look inflated.
  const ownIbans = useMemo(() => new Set(balances.map(b => b.account_iban)), [balances])
  const isInternalTransfer = useCallback(
    (t: BankTransaction) => !!t.counterpart_iban && ownIbans.has(t.counterpart_iban),
    [ownIbans],
  )

  const periodTransactions = useMemo(() => {
    const inRange = transactions.filter(t => t.value_date >= cutoff)
    return selectedIban ? inRange : inRange.filter(t => !isInternalTransfer(t))
  }, [transactions, cutoff, selectedIban, isInternalTransfer])

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Banking</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Raiffeisenbank · FinTS / HBCI
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sync lädt standardmäßig die komplette verfügbare Historie (die Bank begrenzt selbst, wie weit sie zurückreicht).
          </p>
        </div>

        <div className="flex items-start gap-2 flex-wrap justify-end">
          <CategorySuggestions categories={categories} onAccept={updateCategory} />
          <BankSyncButton
            syncStatus={syncStatus}
            onSync={() => startSync()}
            onReset={resetSync}
          />
        </div>
      </div>

      {/* Balance cards — always visible, click to filter by account */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => {
            const isSelected = selectedIban === b.account_iban
            return (
              <button
                key={b.account_iban}
                type="button"
                onClick={() => toggleAccount(b.account_iban)}
                aria-pressed={isSelected}
                className={`relative text-left rounded-lg border p-4 space-y-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/40'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CreditCard className="size-4" />
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
            )
          })}
        </div>
      )}

      {/* Depot-Bestände (Union Investment o.ä.) — automatisch über dieselbe FinTS-Anmeldung synchronisiert */}
      <SyncedHoldingsCard holdings={holdings} />

      {/* Kontostand-Verlauf — one chart per account that has transactions in the current
          (unfiltered or account-filtered) set; reconstructed from the ledger, see
          bank-balance-chart-impl.tsx for why there's no separate history table. */}
      {balances.length > 0 && transactions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances
            .filter(b => transactions.some(t => t.account_iban === b.account_iban))
            .map(b => (
              <BankBalanceChart
                key={b.account_iban}
                accountName={b.account_name ?? b.account_iban}
                currentBalance={b.booked_balance}
                transactions={transactions.filter(t => t.account_iban === b.account_iban)}
              />
            ))}
        </div>
      )}

      {/* Zeitraum toolbar — one compact card instead of a bare row + a separate two-box
          totals strip; the totals themselves now live in BankTrendChart's own header. */}
      {transactions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground pl-1">Zeitraum</span>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  period === p
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {!selectedIban && (
            <span className="text-xs text-muted-foreground/70 ml-auto">
              Umbuchungen zwischen eigenen Konten sind hier rausgerechnet
            </span>
          )}
        </div>
      )}

      {/* Charts */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BankTrendChart transactions={periodTransactions} />
          <BankCategoryChart transactions={periodTransactions} categories={categories} />
        </div>
      )}

      {/* Transactions */}
      <BankTransactionsView
        transactions={transactions}
        categories={categories}
        isLoading={isLoadingTxns}
        onFilter={handleFilter}
        onUpdateCategory={updateCategory}
      />
    </div>
  )
}
