import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="p-4 sm:p-8 max-w-5xl animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <Skeleton className="h-7 w-48 mb-6" />

      {/* Tab-Leiste */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 3 }).map((_, r) => (
              <div key={r} className="flex items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-40 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
