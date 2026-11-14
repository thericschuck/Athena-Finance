'use client'

import { useState, useCallback } from 'react'
import type {
  DepotHolding,
  FinanceCategory,
  SyncStatus,
  SyncResponse,
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

interface UseBankDataReturn {
  holdings:        DepotHolding[]
  categories:      FinanceCategory[]
  syncStatus:      SyncStatus

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
  /** Fetch the last-synced depot holdings (e.g. Union Investment) from DB. */
  loadHoldings:    () => Promise<void>
  /** Fetch the user's Finance categories (shared with /finance/categories). */
  loadCategories:  () => Promise<void>
  /** Reset sync status to idle. */
  resetSync:       () => void
}

export function useBankData(): UseBankDataReturn {
  const [holdings,      setHoldings]      = useState<DepotHolding[]>([])
  const [categories,    setCategories]    = useState<FinanceCategory[]>([])
  const [syncStatus,    setSyncStatus]    = useState<SyncStatus>({ type: 'idle' })
  const [scaStatus,     setScaStatus]     = useState<BankScaInfo[]>([])

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

      // Einzelne fehlgeschlagene Bank-Logins (z.B. falsche PIN) — der Rest des Syncs lief durch.
      // Bewusst nur in der Konsole, nicht im UI.
      for (const w of data.warnings ?? []) console.warn('[bank-sync]', w)
      setSyncStatus({
        type: 'success',
        imported: data.imported ?? 0,
        skipped: data.skipped ?? 0,
      })
      // Eine erfolgreiche Freigabe verschiebt die 90-Tage-Frist — Anzeige aktualisieren.
      void loadScaStatus()
    } catch (err) {
      setSyncStatus({ type: 'error', message: err instanceof Error ? err.message : 'Fehler' })
    }
  }, [loadScaStatus])

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

  const resetSync = useCallback(() => setSyncStatus({ type: 'idle' }), [])

  return {
    holdings,
    categories,
    syncStatus,
    startSync,
    scaStatus,
    loadScaStatus,
    loadHoldings,
    loadCategories,
    resetSync,
  }
}
