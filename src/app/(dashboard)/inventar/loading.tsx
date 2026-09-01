import { Skeleton } from '@/components/ui/skeleton'

/**
 * Die Vitrine als Platzhalter — gleiche Rasterbreiten und gleiches Seitenverhältnis wie
 * die echten Karten, damit beim Eintreffen der Daten nichts springt.
 */
export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-36" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-1/2" />
            <Skeleton className="mt-2.5 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
