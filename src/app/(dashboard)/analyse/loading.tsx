import { Skeleton, SkeletonChart, SkeletonStatCards } from '@/components/ui/skeleton'

/** Kalender-Raster der Ausgaben-Heatmap — 53 Wochen × 7 Tage. */
function HeatmapSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-40" />
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex gap-[3px] overflow-hidden">
        {Array.from({ length: 40 }).map((_, week) => (
          <div key={week} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, day) => (
              <Skeleton key={day} className="size-2.5 rounded-[2px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Ladezustand der Route, formgleich mit der fertigen Seite: Kopf mit Filterleiste, Kennzahlen,
 * Auffaelligkeiten, Tempo + Budget, Heatmap, Geldfluss + Kalender, Monatsvergleich + Kategorien,
 * Gegenparteien — die Reihenfolge folgt der Seite. Abstaende wie dort (`p-4 sm:p-8`).
 */
export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="space-y-3">
        <Skeleton className="h-8 w-32 sm:h-9 sm:w-40" />
        <div className="flex items-center gap-3 overflow-hidden">
          <Skeleton className="h-9 w-32 shrink-0 rounded-md" />
          <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
          <div className="flex shrink-0 gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-11 rounded" />
            ))}
          </div>
        </div>
      </div>

      <SkeletonStatCards count={4} />

      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-72 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonChart variant="area" height={220} />
        <SkeletonChart variant="hbars" height={220} />
      </div>

      <HeatmapSkeleton />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonChart variant="area" height={260} />
        <SkeletonChart variant="bars" height={260} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonChart variant="bars" height={240} legend />
        <SkeletonChart variant="hbars" height={240} />
      </div>

      <SkeletonChart variant="hbars" height={240} />
    </div>
  )
}
