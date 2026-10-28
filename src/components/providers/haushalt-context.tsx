'use client'

import { createContext, useContext } from 'react'

/**
 * Ob der Nutzer Daten mit dem Haushalt teilen kann (mindestens ein weiteres Mitglied). Kommt aus dem Dashboard-Layout
 * (`resolveScope`), damit Formulare den Schalter „Mit Haushalt teilen“ zeigen koennen, ohne dass jede Seite eine Prop
 * durchreichen muss. Reine Anzeige: die Server Actions pruefen das Teilen selbst (src/lib/haushalt/teilen.ts).
 */
const HaushaltContext = createContext<{ canShare: boolean }>({ canShare: false })

export function HaushaltProvider({ canShare, children }: { canShare: boolean; children: React.ReactNode }) {
  return <HaushaltContext.Provider value={{ canShare }}>{children}</HaushaltContext.Provider>
}

export function useCanShare(): boolean {
  return useContext(HaushaltContext).canShare
}
