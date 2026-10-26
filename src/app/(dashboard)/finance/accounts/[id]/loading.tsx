import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Konto-Detail: Zurück-Link, Kopf mit Aktionen, Zeitraumzeile, Kennzahlen, Highlights, Charts und Buchungen. Ersetzt für diese Seite das Listen-Skelett von
 * finance/accounts/loading.tsx, das sonst auch hier gälte.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-4 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Skeleton className="col-span-2 order-first h-10 rounded-md sm:order-last sm:h-8 sm:w-40" />
            <Skeleton className="h-10 rounded-md sm:h-8 sm:w-28" />
            <Skeleton className="h-10 rounded-md sm:h-8 sm:w-28" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <Skeleton className="h-8 w-60 max-w-full rounded-lg" />
        <Skeleton className="h-3 w-32" />
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex h-16 flex-col justify-center gap-1.5 bg-card px-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-14 rounded-lg" />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SkeletonChart variant="area" height={220} />
          <SkeletonChart variant="bars" height={220} />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}
