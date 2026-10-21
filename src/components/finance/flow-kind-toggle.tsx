'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import { INCLUDE_PARAM } from '@/lib/finance/flow-calc'
import { cn } from '@/lib/utils'

/**
 * Schaltet in den Auswertungen Anlagen (Krypto, Depot, Bauspar) und Forderungen/Schulden
 * dazu. Aus ist der Standard: dann zählt nur Konsum, sonst stünde jede Krypto-Einzahlung
 * als Ausgabe in den Diagrammen. Der Zustand liegt in der URL (`anlage=1`), damit er
 * verlinkbar ist und beim Neuladen bleibt.
 */
export function FlowKindToggle({ className }: { className?: string }) {
  const filters = useUrlFilters()
  const on = filters.get(INCLUDE_PARAM) === '1'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => filters.set(INCLUDE_PARAM, on ? null : '1')}
      title="Krypto, Depot, Bauspar und verliehenes Geld mit in Einnahmen/Ausgaben rechnen"
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative h-3.5 w-6 rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-background transition-[left]',
            on ? 'left-3' : 'left-0.5',
          )}
        />
      </span>
      Anlagen &amp; Forderungen
    </button>
  )
}
