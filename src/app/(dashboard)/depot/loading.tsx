import { Skeleton, SkeletonChart, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0 space-y-5">
          {/* Kennzahlen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>

          <SkeletonChart variant="area" height={208} />

          <SkeletonTable rows={6} cols={[88, 120, 96, 96, 80]} />
        </div>

        {/* Sparpläne-Spalte */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
