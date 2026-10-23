'use client'

import { useCallback } from 'react'
import { useUrlFilters } from '@/components/providers/url-filters'
import type { SankeyData } from '@/lib/analyseData'
import { GeldflussChart } from './GeldflussChart'
import { zumAbschnitt } from './zum-abschnitt'

/**
 * Geldfluss der Analyse-Seite: ein Tipp auf eine Ausgabenkategorie setzt `kat` in der URL und
 * scrollt zur Buchungsliste (#buchungen). Eigene Hülle statt `useUrlFilters()` im Chart selbst,
 * weil der Chart auch auf der Landingpage läuft — dort gibt es keinen `UrlFiltersProvider`, und
 * der Hook würfe einen Fehler.
 *
 * Muss innerhalb von `<UrlFiltersProvider>` stehen (die Analyse-Seite tut das).
 */
export function GeldflussChartUrl({ data }: { data: SankeyData }) {
  const filter = useUrlFilters()
  const aktiv = filter.get('kat')
  const setze = filter.set

  const onKategorie = useCallback((id: string | null) => {
    setze('kat', id)
    if (id) zumAbschnitt('buchungen')
  }, [setze])

  return <GeldflussChart data={data} onKategorie={onKategorie} aktiveKategorie={aktiv} />
}
