'use client'

import { PeriodSelector } from '@/components/ui/period-selector'
import { useUrlFilters } from '@/components/providers/url-filters'
import { DEFAULT_PERIOD, parsePeriod, type Period } from '@/lib/period'

// 1W und 1M fehlen bewusst: Monatstrend und Kategorieverteilung brauchen mehrere Monate,
// um ueberhaupt eine Aussage zu treffen.
const BANK_PERIODS = ['3M', '6M', '1J', 'Alles'] as const

/** Zeitraumwahl ueber die URL. Ein Wechsel hebt die Monatsauswahl auf: der Monat kann im
 *  neuen Fenster fehlen, und dann stuende ein Filter aktiv, dessen Saeule nirgends mehr ist. */
export function BankZeitraum({ current }: { current: Period }) {
  const filters = useUrlFilters()
  // Ein nicht angebotener Zeitraum in der URL (?period=1M) faellt auf dem Server auf den
  // Standard zurueck; hier darf dann nicht eine Option markiert sein, die es gar nicht gibt.
  const roh = filters.get('period')
  const aktiv = roh && (BANK_PERIODS as readonly string[]).includes(roh) ? parsePeriod(roh) : current
  return (
    <PeriodSelector
      value={aktiv}
      options={BANK_PERIODS}
      onSelect={p => filters.setMany({ period: p === DEFAULT_PERIOD ? null : p, month: null })}
    />
  )
}
