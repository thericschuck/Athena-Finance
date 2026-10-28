'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { scopeAnzeige } from '@/lib/haushalt/scope-labels'
import { useScopeLade } from '@/components/haushalt/ScopeLadeContext'
import type { ScopeName } from '@/lib/haushalt/scope'

export type ScopeSwitcherProps = {
  available: ScopeName[]
  active: ScopeName
  /** Eigener Anzeigename; ohne Namen steht „I“. */
  ownName?: string | null
  /** Anzeigename des Partners; ohne Namen steht „P“. */
  partnerName?: string | null
  className?: string
}

/**
 * Segmentierte Auswahl mit je EINEM Zeichen (Anfangsbuchstabe Ich / Partner, „&“ fuer Gemeinsam). Der volle Text
 * steht in aria-label und title (Logik: lib/haushalt/scope-labels.ts). Unsichtbar, solange nur ein Scope verfuegbar ist.
 * Wechsel und Ladezustand kommen aus dem ScopeLadeProvider (AppShell): waehrend des Ladens sind die Segmente gesperrt,
 * das gewaehlte pulsiert.
 */
export function ScopeSwitcher({ available, active, ownName, partnerName, className }: ScopeSwitcherProps) {
  const { scope: optimistic, laedt, wechseln } = useScopeLade()
  const anzeige = useMemo(() => scopeAnzeige(ownName, partnerName), [ownName, partnerName])

  if (available.length < 2) return null
  // Ausserhalb eines Providers (Fallback) gilt der Server-Wert.
  const gewaehlt = laedt ? optimistic : active

  return (
    <div
      role="radiogroup"
      aria-label="Ansicht"
      aria-busy={laedt}
      className={cn('inline-flex w-fit max-w-full gap-0.5 rounded-full bg-sidebar-accent/60 p-0.5', className)}
    >
      {available.map(scope => {
        const selected = scope === gewaehlt
        const { zeichen, text } = anzeige[scope]
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={text}
            title={text}
            disabled={laedt}
            onClick={() => { if (scope !== gewaehlt) wechseln(scope) }}
            className={cn(
              'flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold leading-none',
              'transition-colors outline-none select-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'disabled:cursor-progress',
              selected
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:hover:text-sidebar-foreground/70',
              selected && laedt && 'motion-safe:animate-pulse',
            )}
          >
            <span aria-hidden>{zeichen}</span>
          </button>
        )
      })}
    </div>
  )
}
