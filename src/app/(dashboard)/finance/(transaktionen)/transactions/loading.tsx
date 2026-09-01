import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-5 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>

      {/* Filterleiste */}
      <div className="flex flex-wrap gap-2">
        {[112, 128, 144, 128, 128].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>

      <SkeletonTable rows={12} cols={[80, 120, 120, 200, 96, 48]} />
    </div>
  )
}
