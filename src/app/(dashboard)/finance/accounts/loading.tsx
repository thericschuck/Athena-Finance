import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <SkeletonTable rows={6} cols={[140, 96, 120, 72, 96, 80]} />

      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-2.5 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
