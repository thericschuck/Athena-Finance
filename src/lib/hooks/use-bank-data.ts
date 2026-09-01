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

/**
 * Freigabe-Status eines Bank-Logins. Die Bank verlangt nach PSD2 alle 90 Tage erneut eine
 * starke Authentifizierung (SecureGo plus); dazwischen läuft der Sync freigabefrei — das
 * ist der Zeitraum, den `exemptionExpiresAt` markiert.
 */
export interface BankScaInfo {
  bankLabel: string | null
  lastScaAt: string | null
  exemptionExpiresAt: string | null
  /** Ein automatischer Sync ist abgebrochen, weil eine Freigabe fällig ist. */
  scaRequired: boolean
}

export interface BankDataLoaded {
  transactions: boolean
  balances:     boolean
  holdings:     boolean
  categories:   boolean
}

interface UseBankDataReturn {
  transactions:    BankTransaction[]
  balances:        BankBalance[]
  holdings:        DepotHolding[]
  categories:      FinanceCategory[]
  syncStatus:      SyncStatus
  isLoadingTxns:   boolean
  isLoadingBal:    boolean
  /**
   * Welche Datensätze schon mindestens einmal vom Server zurück sind.
   *
   * `isLoading*` allein reicht für Skeletons nicht: die Flags stehen beim allerersten
   * Rendering noch auf `false` (der Effekt, der lädt, läuft erst nach dem Paint), und
   * ein leeres Array ist in dem Moment nicht von "es gibt wirklich nichts" zu
   * unterscheiden. Genau in dieser Lücke zeigte die Bank-Seite bisher nichts an.
   */
  loaded:          BankDataLoaded

  /**
   * Start a sync. Without arguments this syncs the last 90 days — the window PSD2 exempts
   * from a fresh strong authentication, so it normally runs without an app approval.
   * `fullHistory` requests everything the bank still has and always costs one approval.
   */
  startSync:       (startDate?: Date, endDate?: Date, opts?: { fullHistory?: boolean }) => Promise<void>
  /** Freigabe-Status je Bank-Login (letzte SCA, Ablauf der 90-Tage-Frist). */
  scaStatus:       BankScaInfo[]
  /** Freigabe-Status neu laden. */
  loadScaStatus:   () => Promise<void>
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
  const [scaStatus,     setScaStatus]     = useState<BankScaInfo[]>([])
  const [loaded,        setLoaded]        = useState<BankDataLoaded>({
    transactions: false, balances: false, holdings: false, categories: false,
  })

  const markLoaded = useCallback((key: keyof BankDataLoaded) => {
    setLoaded(prev => prev[key] ? prev : { ...prev, [key]: true })
  }, [])

  // ── Freigabe-Status ─────────────────────────────────────────────────────────
  const loadScaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/sca-status')
      if (!res.ok) return
      const data = await res.json() as { banks?: BankScaInfo[] }
      setScaStatus(data.banks ?? [])
    } catch {
      // Rein informativ — ein Fehler hier darf die Seite nicht stören.
    }
  }, [])

  // ── Start sync ──────────────────────────────────────────────────────────────
  const startSync = useCallback(async (
    startDate?: Date,
    endDate?: Date,
    opts?: { fullHistory?: boolean },
  ) => {
    setSyncStatus({ type: 'loading' })
    try {
      const res = await fetch('/api/bank/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate:   startDate?.toISOString(),
          endDate:     endDate?.toISOString(),
          fullHistory: opts?.fullHistory === true,
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
      // Eine erfolgreiche Freigabe verschiebt die 90-Tage-Frist — Anzeige aktualisieren.
      void loadScaStatus()
    } catch (err) {
      setSyncStatus({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    }
  }, [loadScaStatus])

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
      // Auch nach einem Fehler als "geladen" markieren — sonst bliebe das Skeleton
      // für immer stehen statt in den Leerzustand zu fallen.
      markLoaded('transactions')
      setIsLoadingTxns(false)
    }
  }, [markLoaded])

  // ── Load balances ───────────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    setIsLoadingBal(true)
    try {
      const res = await fetch('/api/bank/balance')
      if (!res.ok) return
      const data: BalanceResponse = await res.json()
      if (data.balances) setBalances(data.balances)
    } finally {
      markLoaded('balances')
      setIsLoadingBal(false)
    }
  }, [markLoaded])

  // ── Load depot holdings ─────────────────────────────────────────────────────
  const loadHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/depot/holdings')
      if (!res.ok) return
      const data: DepotHoldingsResponse = await res.json()
      if (data.holdings) setHoldings(data.holdings)
    } catch {
      // best-effort; depot holdings are a nice-to-have on this page
    } finally {
      markLoaded('holdings')
    }
  }, [markLoaded])

  // ── Load categories ─────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/categories')
      if (!res.ok) return
      const data: CategoriesResponse = await res.json()
      if (data.categories) setCategories(data.categories)
    } catch {
      // best-effort; category dropdowns just fall back to empty
    } finally {
      markLoaded('categories')
    }
  }, [markLoaded])

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
    loaded,
    startSync,
    scaStatus,
    loadScaStatus,
    loadTransactions,
    loadBalances,
    loadHoldings,
    loadCategories,
    updateCategory,
    resetSync,
  }
}
