import { getAuthUser } from '@/lib/supabase/server'
import { ladeDashZustand } from '@/lib/data/dashboard-zustand'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DashZustandZeile } from './DashZustandZeile'

/**
 * Schmale Zustandszeile unter den Hinweisen: Bank (Sync, Freigabe), Steuer, offene Buchungen.
 * Async Server-Komponente hinter <Suspense fallback={null}>: die Steuerberechnung ist teuer und darf
 * den Rest der Seite nicht aufhalten. Fehlt etwas (Berechnung fehlgeschlagen oder zu langsam),
 * fehlt nur dieser Chip; ist gar nichts auswertbar, bleibt die Zeile weg.
 */
export async function DashZustand({ kern }: DashAbschnittProps) {
  const { user } = await getAuthUser()
  if (!user) return null
  const zeile = await ladeDashZustand(user.id, kern.heute)
  return <DashZustandZeile zeile={zeile} />
}
