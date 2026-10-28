import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-60" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <SkeletonCardList rows={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
