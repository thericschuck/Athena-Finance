import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-32 rounded-md" />
        ))}
      </div>

      {/* Breite Verlaufstabelle */}
      <SkeletonTable rows={12} cols={[88, 88, 72, 72, 72, 64, 72, 72, 80, 72, 72, 64]} />
    </div>
  )
}
