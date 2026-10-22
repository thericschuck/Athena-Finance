import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[48, 56, 88, 64].map((w, i) => (
            <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      <SkeletonTable rows={12} cols={[96, 64, 120, 280, 72]} />
    </div>
  )
}
