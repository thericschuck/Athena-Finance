import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Fixkosten nach Konto */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-3.5 w-40" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <SkeletonCardList rows={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
