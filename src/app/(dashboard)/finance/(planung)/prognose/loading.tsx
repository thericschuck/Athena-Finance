import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Prognose: Kopf mit Zeitraum und „Wie wird gerechnet?“, schmale Kennzahlenleiste, ein Diagramm und die
 * Reiter darunter. Die Berechnung (Tageszyklus-Modell, Simulation) läuft im Server-Render; bis sie
 * fertig ist, steht dieses Skelett (gleiche Struktur wie die Seite, damit nichts springt).
 */
export default function Loading() {
  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-52 rounded-lg sm:h-8" />
          <Skeleton className="h-10 w-36 rounded-full sm:h-8" />
        </div>
      </div>

      <Skeleton className="h-14 w-full rounded-lg" />

      <SkeletonChart variant="area" height={300} legend />

      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
