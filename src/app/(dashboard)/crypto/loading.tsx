import { Skeleton, SkeletonChart, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      {/* Portfolio-Tabs */}
      <div className="border-b border-border bg-muted/20 px-4 sm:px-8 py-3 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SkeletonChart variant="donut" height={240} />
          <SkeletonChart variant="area" height={240} className="lg:col-span-2" />
        </div>

        <SkeletonTable rows={8} cols={[120, 80, 100, 120, 96]} />
      </div>
    </div>
  )
}
