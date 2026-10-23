'use client'

import { useCallback } from 'react'
import { useUrlFilters } from '@/components/providers/url-filters'
import type { CashflowEvent } from '@/lib/analyseData'
import { CashflowKalender } from './CashflowKalender'
import { zumAbschnitt } from './zum-abschnitt'

/**
 * Kalender der Analyse-Seite, verdrahtet mit dem Tagesfilter (`tag`) in der URL. Eigene Hülle,
 * weil der Kalender auch auf der Landingpage läuft, wo es keinen `UrlFiltersProvider` gibt.
 */
export function CashflowKalenderUrl({ events }: { events: CashflowEvent[] }) {
  const filter = useUrlFilters()
  const setze = filter.set

  const onTag = useCallback((tag: string | null) => {
    setze('tag', tag)
    if (tag) zumAbschnitt('buchungen')
  }, [setze])

  return <CashflowKalender events={events} onTag={onTag} aktiverTag={filter.get('tag')} />
}
