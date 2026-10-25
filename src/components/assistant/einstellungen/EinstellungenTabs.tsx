'use client'

import { cn } from '@/lib/utils'

export type EinstellungenTab = 'persoenlichkeit' | 'modell' | 'faehigkeiten'

export const EINSTELLUNGEN_TABS: { id: EinstellungenTab; label: string }[] = [
  { id: 'persoenlichkeit', label: 'Persönlichkeit' },
  { id: 'modell', label: 'Modell & Limits' },
  { id: 'faehigkeiten', label: 'Fähigkeiten' },
]

/** Lokale Reiter im Look der Analyse-Reiter, aber ohne URL-Kopplung. Die
    Inhalte der Reiter werden vom Aufrufer nur per `hidden` ausgeblendet, nie
    ausgehängt — sonst fehlen ihre Felder beim Speichern in der FormData. */
export function EinstellungenTabs({
  aktiv,
  onChange,
}: {
  aktiv: EinstellungenTab
  onChange: (tab: EinstellungenTab) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Ansichten"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {EINSTELLUNGEN_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={aktiv === tab.id}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
            aktiv === tab.id
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
