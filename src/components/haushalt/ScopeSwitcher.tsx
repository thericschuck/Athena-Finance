'use client'

import { useOptimistic, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { setScope } from '@/lib/haushalt/actions'
import type { ScopeName } from '@/lib/haushalt/scope'

export type ScopeSwitcherProps = {
  available: ScopeName[]
  active: ScopeName
  /** Anzeigename des Partners; ohne Namen steht „Partner“. */
  partnerName?: string | null
  className?: string
}

const LABELS: Record<ScopeName, string> = { ich: 'Ich', partner: 'Partner', gemeinsam: 'Gemeinsam' }

/**
 * Segmentierte Auswahl Ich | Partner | Gemeinsam. Unsichtbar, solange nur ein Scope verfuegbar ist
 * (kein Haushalt oder kein weiteres Mitglied). Der Wechsel setzt das Cookie per Server Action und laedt das Layout neu.
 */
export function ScopeSwitcher({ available, active, partnerName, className }: ScopeSwitcherProps) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(active)

  if (available.length < 2) return null

  const select = (scope: ScopeName) => {
    if (scope === optimistic) return
    startTransition(async () => {
      setOptimistic(scope)
      await setScope(scope)
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label="Ansicht"
      aria-busy={pending}
      className={cn('flex w-full min-w-0 rounded-md bg-sidebar-accent/60 p-0.5', className)}
    >
      {available.map(scope => {
        const selected = scope === optimistic
        const label = scope === 'partner' ? (partnerName?.trim() || LABELS.partner) : LABELS[scope]
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => select(scope)}
            title={label}
            className={cn(
              'min-w-0 flex-1 truncate rounded px-2 py-1 text-xs transition-colors outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected
                ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
