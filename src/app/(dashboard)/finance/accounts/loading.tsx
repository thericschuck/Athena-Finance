import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-28" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-40 rounded-md sm:h-8" />
          <Skeleton className="h-10 w-36 rounded-md sm:h-8" />
          <Skeleton className="h-10 w-24 rounded-md sm:h-8" />
        </div>
      </div>

      {/* Kennzahlenleiste */}
      <div className="flex h-14 overflow-hidden rounded-lg border border-border bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-32 shrink-0 flex-col justify-center gap-1.5 border-l border-border px-4 first:border-l-0">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      {/* Gruppen */}
      {[3, 2].map((n, g) => (
        <div key={g} className="space-y-1.5">
          <div className="flex items-baseline justify-between px-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="rounded-lg border border-border bg-card">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-border px-3 py-3 first:border-t-0">
                <Skeleton className="size-2.5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
