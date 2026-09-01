import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3.5 w-60" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border px-4 py-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-44" />
            <SkeletonCardList rows={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
