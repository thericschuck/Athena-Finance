'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import type { AthenaEffort } from '@/lib/assistant/settings'
import { updateAthenaModelEffort } from '@/app/(dashboard)/assistant/actions'

export type AthenaChatSettings = { model: string; effort: AthenaEffort }

type Ctx = AthenaChatSettings & {
  setModel: (model: string) => void
  setEffort: (effort: AthenaEffort) => void
}

const AthenaSettingsContext = createContext<Ctx | null>(null)

export function useAthenaChatSettings(): Ctx {
  const ctx = useContext(AthenaSettingsContext)
  if (!ctx) throw new Error('useAthenaChatSettings must be used within AthenaSettingsProvider')
  return ctx
}

/**
 * Model/Denktiefe als geteilter Client-State über die volle Assistant-Seite
 * UND das schwebende Sheet hinweg (beide rendern `AthenaChat`, aber getrennt
 * vom Server) — eine Wahl hier gilt sofort für die nächste Nachricht in jedem
 * offenen Chat, weil `route.ts` die Einstellung ohnehin bei jeder Anfrage neu
 * aus der DB liest, nicht einmalig pro Konversation einfriert.
 *
 * Optimistisch im UI übernehmen: die Server Action persistiert im Hintergrund,
 * ein Fehlschlag dort bedeutet nur, dass die nächste Anfrage wieder auf dem
 * vorher gespeicherten Wert läuft — kein Grund, die Auswahl im UI zurückzudrehen.
 */
export function AthenaSettingsProvider({
  initial,
  children,
}: {
  initial: AthenaChatSettings
  children: React.ReactNode
}) {
  const [state, setState] = useState(initial)

  const setModel = useCallback((model: string) => {
    setState((s) => ({ ...s, model }))
    void updateAthenaModelEffort({ model })
  }, [])

  const setEffort = useCallback((effort: AthenaEffort) => {
    setState((s) => ({ ...s, effort }))
    void updateAthenaModelEffort({ effort })
  }, [])

  return (
    <AthenaSettingsContext.Provider value={{ ...state, setModel, setEffort }}>
      {children}
    </AthenaSettingsContext.Provider>
  )
}
