import { Skeleton } from '@/components/ui/skeleton'

/**
 * Steuerposition: Kopf mit Jahreswahl, vier Kennzahlen, Rechenweg links und Kleinunternehmer/Rücklage rechts, darunter
 * der Krypto-Abschnitt. Die Seite lädt Buchungen, Tarife, Rollen und die Kraken-Historie in einem Zug; das Skelett
 * steht, bis alles da ist.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-14 rounded-md" />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-card px-4 py-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className={i < 2 ? 'h-8 w-28' : 'h-6 w-24'} />
            <Skeleton className="h-2.5 w-40" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-3">
                <Skeleton className="h-5 w-40 rounded-md" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
