import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Prognose: Kopf mit Erklärtext, vier Kennzahlen, Diagramm, darunter Annahmen und Einmalposten. Die Berechnung
 * (Tageszyklus-Modell, Simulation) läuft im Server-Render; bis sie fertig ist, steht dieses Skelett.
 */
export default function Loading() {
  return (
    <div className="space-y-8 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3.5 w-full max-w-3xl" />
        <Skeleton className="h-3.5 w-2/3 max-w-xl" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-2.5 w-full" />
          </div>
        ))}
      </div>

      <SkeletonChart variant="area" height={300} legend />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            ))}
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
