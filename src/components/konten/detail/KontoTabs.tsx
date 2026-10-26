'use client'

import { useEffect, useState } from 'react'
import { useUrlFilters } from '@/components/providers/url-filters'

/**
 * Ansichten der Konto-Detailseite: Überblick, Buchungen, Auswertung. Aufbau wie AnalyseTabs
 * (fertige Server-Inhalte als Props, einmal geöffnete Tabs bleiben eingehängt, aktiver Tab in der
 * URL unter `ansicht`, nur als Abweichung vom Standard).
 *
 * Eigene Komponente statt AnalyseTabs, weil der Provider dieser Seite `resetKeys="seite"` hat
 * (Seite 1 bei jedem Filterwechsel): ein reiner `set('ansicht')` würde dabei auch `seite` aus der
 * URL löschen — das wäre nicht mehr „nur lokale Schlüssel“ und löste ein Server-Rendering aus (und
 * die Seitenzahl ginge verloren). Deshalb wird `seite` beim Tab-Wechsel mit seinem aktuellen Wert
 * mitgeschrieben: ein unveränderter, selbst gesetzter Schlüssel zählt nicht als Änderung und wird
 * vom Zurücksetzen ausgenommen.
 */
export interface KontoTab {
  key: string
  label: string
  inhalt: React.ReactNode
}

export function KontoTabs({ tabs }: { tabs: KontoTab[] }) {
  const filters = useUrlFilters()
  const standard = tabs[0]?.key
  const roh = filters.get('ansicht')
  const aktiv = tabs.some(t => t.key === roh) ? (roh as string) : standard

  const [besucht, setBesucht] = useState<Set<string>>(() => new Set(aktiv ? [aktiv] : []))
  useEffect(() => {
    if (aktiv && !besucht.has(aktiv)) setBesucht(prev => new Set(prev).add(aktiv))
  }, [aktiv, besucht])

  return (
    <div className="min-w-0 space-y-4">
      <div
        role="tablist"
        aria-label="Ansicht"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(t => {
          const an = t.key === aktiv
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`konto-tab-${t.key}`}
              aria-selected={an}
              aria-controls={`konto-panel-${t.key}`}
              onClick={() => filters.setMany({
                ansicht: t.key === standard ? null : t.key,
                seite: filters.get('seite'),
              })}
              className={`min-h-10 shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                an
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tabs.map(t => (
        <div
          key={t.key}
          role="tabpanel"
          id={`konto-panel-${t.key}`}
          aria-labelledby={`konto-tab-${t.key}`}
          hidden={t.key !== aktiv}
          className="min-w-0 space-y-4"
        >
          {(t.key === aktiv || besucht.has(t.key)) && t.inhalt}
        </div>
      ))}
    </div>
  )
}
