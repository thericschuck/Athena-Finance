'use client'

import { createContext, useContext } from 'react'

/**
 * Bereinigter Anzeigename des angemeldeten Nutzers (nutzername.ts: `anzeigeName`) oder `null`, dazu ob schon
 * Ausgangslage-Gedächtnis existiert (dann wird der Kennenlern-Prompt nicht vorbefüllt). Kommt aus dem Dashboard-Layout.
 * Reine Anzeige, keine Berechtigung.
 */
type NutzerWert = { name: string | null; hatAusgangslage: boolean }
const NutzerContext = createContext<NutzerWert>({ name: null, hatAusgangslage: false })

export function NutzerProvider({
  name,
  hatAusgangslage = false,
  children,
}: {
  name: string | null
  hatAusgangslage?: boolean
  children: React.ReactNode
}) {
  return <NutzerContext.Provider value={{ name, hatAusgangslage }}>{children}</NutzerContext.Provider>
}

export function useNutzerName(): string | null {
  return useContext(NutzerContext).name
}

export function useNutzer(): NutzerWert {
  return useContext(NutzerContext)
}
