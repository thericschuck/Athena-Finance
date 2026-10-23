'use client'

import type { AnalyseMode } from '@/lib/analyseData'

export const ANALYSE_MODE_OPTIONS: readonly { value: AnalyseMode; label: string }[] = [
  { value: 'ausgaben',  label: 'Ausgaben' },
  { value: 'einnahmen', label: 'Einnahmen' },
  { value: 'guv',       label: 'GuV' },
]

/**
 * Der Umschalter im Kopf der Analyse-Karten (Heatmap, Verteilung, Kategorien).
 * Eigene Komponente, damit die Karten optisch nicht auseinanderlaufen — das
 * Markup stand vorher nur in der Heatmap und wurde beim zweiten Vorkommen
 * fällig.
 */
export function ModeSwitch<T extends string>({ value, options, onChange }: {
  value:    T
  options:  readonly { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          // 11 px und mehr Polster: auf dem Handy ist das ein Tippziel, kein Mauszeiger-Ziel
          // (vorher 10 px Schrift bei 4 px Höhenpolster).
          className={`px-3 py-1.5 text-[11px] rounded font-medium transition-all duration-150 sm:px-2.5 sm:py-1 ${
            value === o.value
              ? 'bg-foreground text-background scale-105'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
