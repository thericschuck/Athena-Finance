'use client'

import { useEffect, useState } from 'react'
import { useUrlFilters } from '@/components/providers/url-filters'

/**
 * Gliedert die Analyse in wenige Ansichten, damit die Seite nicht aus zehn Karten untereinander
 * besteht: Überblick, Monat, Muster. Die Buchungsliste steht bewusst NICHT in einem Tab, sondern
 * immer darunter — sie ist das Ziel jedes Klicks in den Charts (Kategorie, Monat, Tag, Partei),
 * und ein Tab-Wechsel beim Anspringen wäre eine Überraschung.
 *
 * Die Inhalte kommen als fertige Server-Komponenten (`inhalt`). Ein Tab wird erst beim ersten
 * Öffnen eingehängt und bleibt danach nur ausgeblendet: so starten die Charts der anderen Tabs
 * nicht gleichzeitig (Recharts, Messungen), und ein Zurückwechseln verliert keinen Zustand
 * (Schalter, Scrollposition in der Heatmap).
 *
 * Der aktive Tab steht in der URL (`ansicht`, nur Abweichung vom Standard) und ist als `localKeys`
 * des Providers ohne Server-Rendering schaltbar.
 */
export interface AnalyseTab {
  key: string
  label: string
  inhalt: React.ReactNode
}

export function AnalyseTabs({ tabs }: { tabs: AnalyseTab[] }) {
  const filters = useUrlFilters()
  const standard = tabs[0]?.key
  const roh = filters.get('ansicht')
  const aktiv = tabs.some(t => t.key === roh) ? (roh as string) : standard

  // Einmal geöffnete Tabs bleiben eingehängt (nur ausgeblendet).
  const [besucht, setBesucht] = useState<Set<string>>(() => new Set(aktiv ? [aktiv] : []))
  useEffect(() => {
    if (aktiv && !besucht.has(aktiv)) setBesucht(prev => new Set(prev).add(aktiv))
  }, [aktiv, besucht])

  return (
    <div className="space-y-4">
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
              id={`analyse-tab-${t.key}`}
              aria-selected={an}
              aria-controls={`analyse-panel-${t.key}`}
              onClick={() => filters.set('ansicht', t.key === standard ? null : t.key)}
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
          id={`analyse-panel-${t.key}`}
          aria-labelledby={`analyse-tab-${t.key}`}
          hidden={t.key !== aktiv}
          className="space-y-4"
        >
          {(t.key === aktiv || besucht.has(t.key)) && t.inhalt}
        </div>
      ))}
    </div>
  )
}
