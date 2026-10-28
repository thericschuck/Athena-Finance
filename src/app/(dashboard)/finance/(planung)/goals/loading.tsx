import { Skeleton } from '@/components/ui/skeleton'

function ZielSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-40 max-w-[60%]" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-48 max-w-full rounded-full" />
    </div>
  )
}

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="min-w-0 animate-in space-y-4 p-4 fade-in duration-150 sm:p-8">
      <span className="sr-only">Lädt…</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <ZielSkeleton key={i} />)}
      </div>
    </div>
  )
}
