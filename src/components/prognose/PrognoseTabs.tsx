'use client'

import { useState } from 'react'

/**
 * Gliedert die Seite unter dem Diagramm in wenige Ansichten (Annahmen, Monate, Termine, Steuer,
 * Einmalposten), damit sie nicht aus fünf langen Abschnitten untereinander besteht. Die Inhalte
 * kommen als fertige Server-Komponenten; nicht gezeigte Tabs sind nur ausgeblendet (`hidden`), ein
 * Wechsel verliert also keine Eingaben. Die Tableiste scrollt bei Bedarf in sich (nie die Seite).
 */
export type PrognoseTab = {
  key: string
  label: string
  /** Kleine Zahl hinter dem Namen (z. B. Anzahl Annahmen). */
  anzahl?: number
  inhalt: React.ReactNode
}

export function PrognoseTabs({ tabs, start }: { tabs: PrognoseTab[]; start?: string }) {
  const [aktiv, setAktiv] = useState(start && tabs.some(t => t.key === start) ? start : tabs[0]?.key)

  return (
    <div className="min-w-0 space-y-3">
      <div role="tablist" aria-label="Ansicht" className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(t => {
          const an = t.key === aktiv
          return (
            <button
              key={t.key} type="button" role="tab" id={`prognose-tab-${t.key}`}
              aria-selected={an} aria-controls={`prognose-panel-${t.key}`}
              onClick={() => setAktiv(t.key)}
              className={`min-h-10 shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                an ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
              {t.anzahl !== undefined && t.anzahl > 0 && <span className="ml-1.5 text-xs opacity-70">{t.anzahl}</span>}
            </button>
          )
        })}
      </div>
      {tabs.map(t => (
        <div
          key={t.key} role="tabpanel" id={`prognose-panel-${t.key}`} aria-labelledby={`prognose-tab-${t.key}`}
          hidden={t.key !== aktiv} className="min-w-0"
        >
          {t.inhalt}
        </div>
      ))}
    </div>
  )
}
