import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton'

/** Strategien: Kopf mit Untertitel und Aktion, darunter das Kartenraster (1 / 2 / 3 Spalten wie die Seite). */
export default function Loading() {
  return (
    <SkeletonRegion className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40" />
          <div className="mt-0.5 flex h-5 items-center">
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card px-5 py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40 max-w-[60%]" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}
