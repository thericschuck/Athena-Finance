'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { BankSyncButton } from '@/components/bank/bank-sync-button'

/**
 * Der FinTS-Sync im Kopf von Finance/Konten.
 *
 * Vorher gab es dafür einen eigenen Hauptpunkt „Banking" mit einer Seite, die im Kern aus
 * diesem Knopf plus einer Liste der gesyncten Konten bestand. Die Liste war eine Doppelung:
 * für verknüpfte Konten (`accounts.bank_iban`) IST der gesyncte `bank_balance` schon der
 * Kontostand in der Tabelle hier drunter — dieselbe Zahl aus derselben Quelle, nur zweimal
 * gerendert. Der Knopf gehört an das Objekt, das er aktualisiert, und das sind die Konten.
 *
 * Die Kontenseite ist eine Server Component, dieser Teil eine Client-Insel: `useBankData`
 * spricht die Bank-Routen über `fetch` an und braucht Zustand (läuft ein Sync, wartet er auf
 * eine Freigabe). Geladen wird hier nur der Freigabe-Status — die Salden rendert der Server.
 */
export function BankSyncPanel() {
  const router = useRouter()
  const { syncStatus, startSync, resetSync, scaStatus, loadScaStatus } = useBankData()

  useEffect(() => {
    loadScaStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nach einem erfolgreichen Sync die Seite neu rendern lassen, statt die Salden hier ein
  // zweites Mal zu holen: der Server liest `bank_balance`, `accounts` und die Sparkline-
  // Historie in einem Zug, und die Tabelle steht danach mit frischen Zahlen da.
  useEffect(() => {
    if (syncStatus.type === 'success') router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

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
