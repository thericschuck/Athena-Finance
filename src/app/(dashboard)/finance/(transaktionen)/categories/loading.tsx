import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4 p-4 animate-in fade-in duration-150 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-md sm:h-8" />
        </div>
      </div>

      {/* Kennzahlenleiste */}
      <Skeleton className="h-14 w-full rounded-lg" />

      {/* Suche und Chips */}
      <Skeleton className="h-10 w-full rounded-md sm:h-8" />
      <div className="flex flex-wrap gap-1.5">
        {[64, 84, 84, 72, 120, 120].map((w, i) => (
          <Skeleton key={i} className="h-10 rounded-full sm:h-8" style={{ width: w }} />
        ))}
      </div>

      {/* Hauptkategorien */}
      <div className="space-y-3">
        {[3, 2, 4].map((n, i) => (
          <div key={i} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            {Array.from({ length: n }, (_, j) => (
              <div key={j} className="flex items-center gap-3 border-t border-border py-2.5 pl-8 pr-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-4 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
