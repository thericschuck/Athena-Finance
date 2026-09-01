import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      <SkeletonTable rows={10} cols={[180, 96, 120, 80]} />
    </div>
  )
}
