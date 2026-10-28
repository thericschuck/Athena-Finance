import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="min-w-0 space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-full md:h-8" />
          <Skeleton className="h-10 w-32 md:h-9" />
        </div>
      </div>

      <Skeleton className="h-14 w-full rounded-lg" />

      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 px-3 py-3 sm:px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="ml-auto h-5 w-20" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-24 md:h-8" />
                <Skeleton className="h-10 w-28 md:h-8" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
