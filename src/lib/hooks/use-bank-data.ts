'use client'

import { useState, useCallback } from 'react'
import type {
  BankTransaction,
  BankBalance,
  DepotHolding,
  FinanceCategory,
  SyncStatus,
  SyncResponse,
  BalanceResponse,
  TransactionsResponse,
  DepotHoldingsResponse,
  CategoriesResponse,
} from '@/types/bank'

interface UseBankDataReturn {
  transactions:    BankTransaction[]
  balances:        BankBalance[]
  holdings:        DepotHolding[]
  categories:      FinanceCategory[]
  syncStatus:      SyncStatus
  isLoadingTxns:   boolean
  isLoadingBal:    boolean

  /** Start a sync (optionally with date range). Omit both to sync full history. */
  startSync:       (startDate?: Date, endDate?: Date) => Promise<void>
  /** Fetch stored transactions from DB. */
  loadTransactions:(params?: { iban?: string; categoryId?: string; q?: string; limit?: number }) => Promise<void>
  /** Fetch live balances from FinTS and persist. */
  loadBalances:    () => Promise<void>
  /** Fetch the last-synced depot holdings (e.g. Union Investment) from DB. */
  loadHoldings:    () => Promise<void>
  /** Fetch the user's Finance categories (shared with /finance/categories). */
  loadCategories:  () => Promise<void>
  /** Update a transaction's category (optimistic). */
  updateCategory:  (id: string, categoryId: string | null) => Promise<void>
  /** Reset sync status to idle. */
  resetSync:       () => void
}

export function useBankData(): UseBankDataReturn {
  const [transactions,  setTransactions]  = useState<BankTransaction[]>([])
  const [balances,      setBalances]      = useState<BankBalance[]>([])
  const [holdings,      setHoldings]      = useState<DepotHolding[]>([])
  const [categories,    setCategories]    = useState<FinanceCategory[]>([])
  const [syncStatus,    setSyncStatus]    = useState<SyncStatus>({ type: 'idle' })
  const [isLoadingTxns, setIsLoadingTxns] = useState(false)
  const [isLoadingBal,  setIsLoadingBal]  = useState(false)

  // ── Start sync ──────────────────────────────────────────────────────────────
  const startSync = useCallback(async (startDate?: Date, endDate?: Date) => {
    setSyncStatus({ type: 'loading' })
    try {
      const res = await fetch('/api/bank/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate?.toISOString(),
          endDate:   endDate?.toISOString(),
        }),
      })
      if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`Server-Fehler ${res.status} — bitte Dev-Server-Log prüfen`)
      }
      const data: SyncResponse = await res.json()

      if (data.error) {
        setSyncStatus({ type: 'error', message: data.error })
        return
      }

      setSyncStatus({
        type: 'success',
        imported: data.imported ?? 0,
        skipped: data.skipped ?? 0,
        warnings: data.warnings,
      })
    } catch (err) {
      setSyncStatus({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    }
  }, [])

  // ── Load transactions ───────────────────────────────────────────────────────
  const loadTransactions = useCallback(async (params?: {
    iban?: string; categoryId?: string; q?: string; limit?: number
  }) => {
    setIsLoadingTxns(true)
    try {
      const url = new URL('/api/bank/transactions', window.location.origin)
      if (params?.iban)       url.searchParams.set('iban',       params.iban)
      if (params?.categoryId) url.searchParams.set('categoryId', params.categoryId)
      if (params?.q)          url.searchParams.set('q',          params.q)
      if (params?.limit)      url.searchParams.set('limit',      String(params.limit))

      const res = await fetch(url.toString())
      if (!res.ok) return
      const data: TransactionsResponse = await res.json()
      if (data.transactions) setTransactions(data.transactions)
    } finally {
      setIsLoadingTxns(false)
    }
  }, [])

  // ── Load balances ───────────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    setIsLoadingBal(true)
    try {
      const res = await fetch('/api/bank/balance')
      if (!res.ok) return
      const data: BalanceResponse = await res.json()
      if (data.balances) setBalances(data.balances)
    } finally {
      setIsLoadingBal(false)
    }
  }, [])

  // ── Load depot holdings ─────────────────────────────────────────────────────
  const loadHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/depot/holdings')
      if (!res.ok) return
      const data: DepotHoldingsResponse = await res.json()
      if (data.holdings) setHoldings(data.holdings)
    } catch {
      // best-effort; depot holdings are a nice-to-have on this page
    }
  }, [])

  // ── Load categories ─────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/categories')
      if (!res.ok) return
      const data: CategoriesResponse = await res.json()
      if (data.categories) setCategories(data.categories)
    } catch {
      // best-effort; category dropdowns just fall back to empty
    }
  }, [])

  // ── Update category ────────────────────────────────────────────────────────
  const updateCategory = useCallback(async (id: string, categoryId: string | null) => {
    const previous = transactions
    // Optimistic update
    setTransactions(txns => txns.map(t => t.id === id ? { ...t, category_id: categoryId } : t))

    try {
      const res = await fetch(`/api/bank/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (!res.ok) throw new Error('Kategorie konnte nicht gespeichert werden')
    } catch {
      // Roll back on failure
      setTransactions(previous)
    }
  }, [transactions])

  const resetSync = useCallback(() => setSyncStatus({ type: 'idle' }), [])

  return {
    transactions,
    balances,
    holdings,
    categories,
    syncStatus,
    isLoadingTxns,
    isLoadingBal,
    startSync,
    loadTransactions,
    loadBalances,
    loadHoldings,
    loadCategories,
    updateCategory,
    resetSync,
  }
}
