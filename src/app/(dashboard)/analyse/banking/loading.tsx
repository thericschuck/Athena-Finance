import {
  Skeleton,
  SkeletonChart,
  SkeletonStatCards,
  SkeletonTable,
  SkeletonToolbar,
} from '@/components/ui/skeleton'

/**
 * Bewusst formgleich mit dem Ladezustand, den `page.tsx` selbst rendert: erst greift diese
 * Datei (Route-Übergang), danach die Client-Seite (Daten-Fetch). Wenn beide dieselbe
 * Silhouette zeigen, sieht der Wechsel wie ein durchgehender Ladevorgang aus.
 *
 * Kontokarten, drei Saldenverläufe, Zeitraum-Leiste, Trend + Kategorien, Buchungstabelle —
 * die Reihenfolge folgt der Seite.
 */
export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-3 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      <SkeletonStatCards count={3} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonChart key={i} variant="area" height={180} />
        ))}
      </div>

      <SkeletonToolbar pills={4} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart variant="bars" height={220} legend />
        <SkeletonChart variant="hbars" height={220} />
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-40 rounded-md" />
        </div>
        <SkeletonTable rows={8} cols={[72, 120, 200, 120, 80]} />
      </div>
    </div>
  )
}
