import { Skeleton, SkeletonChart, SkeletonTable } from '@/components/ui/skeleton'

/**
 * Konto-Detail: Zurück-Link, Kopf mit Aktionen, Zeitraumleiste, Kennzahlen, Verlauf und Buchungstabelle. Ersetzt für diese
 * Seite das Listen-Skelett von finance/accounts/loading.tsx, das sonst auch hier gälte.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-8 animate-in fade-in duration-150">
      <Skeleton className="h-4 w-24" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-11 rounded" />
          ))}
        </div>
        <Skeleton className="h-3 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart variant="area" height={220} />
        <SkeletonChart variant="bars" height={220} />
      </div>

      <SkeletonTable rows={10} cols={[80, 140, 240, 96, 48]} />
    </div>
  )
}
