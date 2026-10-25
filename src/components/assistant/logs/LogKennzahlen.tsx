import { cn } from '@/lib/utils'

/**
 * Kennzahlen der Logs in EINER Karte mit dünnen Trennlinien (Look wie AnalyseKennzahlen):
 * am Handy 2x2, ab sm vier Zellen nebeneinander. Reine Anzeige, ohne Zustand.
 */
export type LogKennzahl = { titel: string; wert: string; schlecht?: boolean }

export function LogKennzahlen({ zellen }: { zellen: LogKennzahl[] }) {
  return (
    <section
      aria-label="Kennzahlen der letzten 24 Stunden"
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4"
    >
      {zellen.map((z, i) => (
        <div
          key={z.titel}
          className={cn(
            'flex min-w-0 flex-col justify-center px-4 py-2.5',
            // 2x2: rechte Spalte links getrennt, untere Reihe oben getrennt.
            i % 2 === 1 && 'border-l border-border',
            i >= 2 && 'border-t border-border',
            // ab sm: eine Reihe, nur Linien zwischen den Zellen.
            'sm:border-t-0',
            i > 0 && 'sm:border-l sm:border-border',
          )}
        >
          <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {z.titel}
          </span>
          <span
            className={cn(
              'mt-0.5 text-base font-semibold tabular-nums tracking-tight',
              z.schlecht && 'text-destructive',
            )}
          >
            {z.wert}
          </span>
        </div>
      ))}
    </section>
  )
}
