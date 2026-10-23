'use client'

import { useUrlFilters } from '@/components/providers/url-filters'

import { PERIODS } from '@/lib/period'

interface Props {
  /** Zeitraum aus der URL — nur noch der Startwert für das erste Rendering. */
  current: string
}

export function AnalysePeriodSelector({ current }: Props) {
  // Merge in die bestehende Query, damit ein Zeitraumwechsel den Kontenfilter aus
  // AnalyseAccountSelector nicht wegwirft (und umgekehrt).
  const filters = useUrlFilters()

  // Der optimistische Wert markiert den geklickten Button sofort; erst wenn der Server
  // geantwortet hat, kommt er wieder aus der echten URL.
  const active = filters.get('period') ?? current

  return (
    <div className="flex gap-1">
      {PERIODS.map(p => (
        <button
          key={p}
          // Ein anderer Zeitraum hebt Monat und Tag auf: sie koennen im neuen Fenster fehlen, und dann
          // stuende ein Filter aktiv, dessen Balken nirgends mehr zu sehen ist.
          onClick={() => filters.setMany({ period: p, monat: null, tag: null })}
          aria-pressed={active === p}
          className={`px-2.5 py-1 text-xs rounded font-medium transition-all duration-150 ${
            active === p
              ? 'bg-foreground text-background scale-105'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
