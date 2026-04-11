'use client'

import { useEffect } from 'react'
import { Landmark, CreditCard } from 'lucide-react'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankSyncButton } from '@/components/bank/bank-sync-button'
import { BankTransactionsView } from '@/components/bank/bank-transactions-view'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useSettings } from '@/components/providers/settings-context'

export default function BankPage() {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const {
    transactions,
    balances,
    syncStatus,
    isLoadingTxns,
    startSync,
    submitTan,
    loadTransactions,
    loadBalances,
    resetSync,
  } = useBankData()

  // Load stored data on mount
  useEffect(() => {
    loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After a successful sync, reload transactions
  useEffect(() => {
    if (syncStatus.type === 'success') {
      loadTransactions()
      loadBalances()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalIncome  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount,  0)
  const totalExpense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount,  0)

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
        </div>

        <BankSyncButton
          syncStatus={syncStatus}
          onSync={() => startSync()}
          onSubmitTan={(ref, tan) => submitTan(ref, tan)}
          onReset={resetSync}
        />
      </div>

      {/* Balance cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => (
            <div key={b.account_iban} className="rounded-lg border border-border bg-card p-4 space-y-1">
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
            </div>
          ))}
        </div>
      )}

      {/* Summary strip */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Einnahmen (Zeitraum)</p>
            <p className="mt-1 text-lg font-semibold text-green-600 dark:text-green-400">
              +{fmtEur(totalIncome)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Ausgaben (Zeitraum)</p>
            <p className="mt-1 text-lg font-semibold text-red-600 dark:text-red-400">
              {fmtEur(totalExpense)}
            </p>
          </div>
        </div>
      )}

      {/* Transactions */}
      <BankTransactionsView
        transactions={transactions}
        isLoading={isLoadingTxns}
        onFilter={params => loadTransactions(params)}
      />
    </div>
  )
}
