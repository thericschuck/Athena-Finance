import { ladeDashZustand } from '@/lib/data/dashboard-zustand'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { dashboardLeer } from '@/lib/dashboard/leer'
import { DashZustandZeile } from './DashZustandZeile'

/**
 * Schmale Zustandszeile unter den Hinweisen: Bank (Sync, Freigabe), Steuer, offene Buchungen.
 * Async Server-Komponente hinter <Suspense fallback={null}>: die Steuerberechnung ist teuer und darf
 * den Rest der Seite nicht aufhalten. Fehlt etwas (Berechnung fehlgeschlagen oder zu langsam),
 * fehlt nur dieser Chip; ist gar nichts auswertbar, bleibt die Zeile weg.
 */
export async function DashZustand({ kern }: DashAbschnittProps) {
  // Ohne Buchungen gibt es nichts zu pruefen (Steuer, Bank, offene Buchungen): die Zeile sagt nichts aus.
  if (dashboardLeer(kern).keineBuchungen) return null
  const zeile = await ladeDashZustand(kern.scopeCtx, kern.heute)
  return <DashZustandZeile zeile={zeile} />
}
