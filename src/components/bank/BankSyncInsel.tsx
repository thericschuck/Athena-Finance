'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankSyncButton } from './bank-sync-button'

/**
 * Der Sync-Knopf als einzige Client-Insel mit eigenem Zustand: Der Sync laeuft ueber
 * /api/bank/sync, nicht ueber die Seitendaten. Nach einem erfolgreichen Sync laedt
 * `router.refresh()` die Server-Seite neu — Salden, Buchungen und Monatssummen kommen dann
 * frisch, ohne dass die Seite das einzeln nachladen muss (wie es die alte Client-Seite tat).
 */
export function BankSyncInsel() {
  const router = useRouter()
  const { syncStatus, startSync, resetSync, scaStatus, loadScaStatus } = useBankData()

  useEffect(() => {
    void loadScaStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (syncStatus.type === 'success') router.refresh()
  }, [syncStatus, router])

  return (
    <BankSyncButton
      syncStatus={syncStatus}
      onSync={() => startSync()}
      onSyncFull={() => startSync(undefined, undefined, { fullHistory: true })}
      onReset={resetSync}
      scaStatus={scaStatus}
    />
  )
}
