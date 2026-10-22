import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

/** Reports: Kopf, Karte „Jahresreport erstellen" und die Liste der vorhandenen Reports. */
export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3.5 w-full max-w-xl" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-72" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <Skeleton className="h-8 w-48 rounded-md" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <SkeletonCardList rows={4} />
      </div>
    </div>
  )
}
