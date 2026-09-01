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
          className={`px-2.5 py-1 text-[10px] rounded font-medium transition-all duration-150 ${
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
