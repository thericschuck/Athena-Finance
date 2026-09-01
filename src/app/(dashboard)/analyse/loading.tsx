import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

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

export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-9 w-40" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-36 rounded-md" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-11 rounded" />
            ))}
          </div>
        </div>
      </div>

      <HeatmapSkeleton />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonChart variant="area" height={260} />
        <SkeletonChart variant="bars" height={260} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonChart variant="bars" height={240} legend />
        <SkeletonChart variant="hbars" height={240} />
      </div>

      <SkeletonChart variant="area" height={200} />
    </div>
  )
}
