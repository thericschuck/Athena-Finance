'use client'

import { useEffect } from 'react'
import { useBankData } from '@/lib/hooks/use-bank-data'
import { SyncedHoldingsCard } from '@/components/bank/synced-holdings-card'

/**
 * Depot-Bestände, die über dieselbe FinTS-Anmeldung wie der Kontosync hereinkommen
 * (Union Investment o.ä.).
 *
 * Stand vorher unten auf der Banking-Seite und wäre mit ihr verschwunden — es ist die
 * einzige Stelle, an der diese Bestände überhaupt zu sehen sind. Auf der Kontenseite steht
 * es jetzt neben dem Abschnitt „Depots", und das ist auch inhaltlich der richtige Nachbar.
 *
 * Eigene Insel statt Teil von `BankSyncPanel`: die beiden stehen an verschiedenen Stellen
 * der Seite. `useBankData` ist ein einfacher Hook ohne geteilten Zustand, jede Insel lädt
 * also nur, was sie selbst zeigt — hier die Bestände, dort der Freigabe-Status.
 */
export function SyncedHoldingsSection() {
  const { holdings, loadHoldings } = useBankData()

  useEffect(() => {
    loadHoldings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rendert sich selbst weg, wenn es keine Bestände gibt.
  return <SyncedHoldingsCard holdings={holdings} />
}
