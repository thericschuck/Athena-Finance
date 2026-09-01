'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import { PERIODS, type Period } from '@/lib/period'
import { cn } from '@/lib/utils'

/**
 * Segmented Control für die Zeitraumwahl.
 *
 * Zwei Varianten, weil die Seiten unterschiedlich rendern:
 *   - `PeriodSelector`     — kontrolliert über value/onChange, für Client-Seiten (/bank).
 *   - `UrlPeriodSelector`  — schreibt in die URL, für server-gerenderte Seiten (Finance).
 * Beide teilen sich `Segments`, damit sie nicht auseinanderlaufen.
 *
 * Zum Design: der alte Zustand war `scale-105` auf dem aktiven Button — der sprang beim
 * Wechsel und schob die Nachbarn an. Stattdessen liegt jetzt eine Pille in einer Schiene,
 * die Buttons behalten ihre Größe und nur Hintergrund und Textfarbe wechseln.
 */

interface SegmentsProps {
  value: Period
  onSelect: (p: Period) => void
  /** Zeiträume, die für diese Seite sinnvoll sind. Default: alle. */
  options?: readonly Period[]
  /** Zeigt an, dass die neuen Daten noch unterwegs sind. */
  pending?: boolean
  className?: string
}

function Segments({ value, onSelect, options = PERIODS, pending, className }: SegmentsProps) {
  return (
    <div
      role="group"
      aria-label="Zeitraum"
      // aria-busy statt eines Spinners: der Wechsel dauert meist nur Millisekunden, ein
      // erscheinender und sofort verschwindender Spinner flackert mehr als er hilft.
      aria-busy={pending || undefined}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5',
        pending && 'opacity-70',
        className,
      )}
    >
      {options.map(p => {
        const active = value === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            aria-pressed={active}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-xs font-medium tabular-nums',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

/** Kontrollierte Variante für Seiten, die den Zeitraum selbst im State halten. */
export function PeriodSelector(props: SegmentsProps) {
  return <Segments {...props} />
}

interface UrlPeriodSelectorProps {
  /** Zeitraum aus den searchParams — nur der Startwert fürs erste Rendering. */
  current: Period
  options?: readonly Period[]
  /** Query-Parameter, Default `period`. */
  param?: string
  className?: string
}

/**
 * Schreibt den Zeitraum in die URL und löst damit ein Server-Rendering aus. Der Wert kommt
 * über `useUrlFilters().get()` und nicht direkt aus `useSearchParams()`, damit der Klick
 * sofort sichtbar ist statt erst nach der Server-Antwort (siehe url-filters.tsx).
 *
 * Braucht einen `<UrlFiltersProvider>` weiter oben im Baum.
 */
export function UrlPeriodSelector({
  current,
  options,
  param = 'period',
  className,
}: UrlPeriodSelectorProps) {
  const filters = useUrlFilters()
  const active = (filters.get(param) as Period | null) ?? current

  return (
    <Segments
      value={active}
      onSelect={p => filters.set(param, p)}
      options={options}
      pending={filters.pending}
      className={className}
    />
  )
}
