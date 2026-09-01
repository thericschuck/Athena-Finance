import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

function CardSkeleton({ pairs = 2 }: { pairs?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-1">
        {Array.from({ length: pairs * 2 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="p-6 lg:p-8 space-y-8 mx-auto w-full max-w-[1600px] animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* Row 1: Net Worth + Monat + Crypto */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Row 2: Verlauf + Verteilung */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SkeletonChart variant="area" height={220} className="lg:col-span-2" />
        <SkeletonChart variant="donut" height={220} />
      </div>

      {/* Konten-Kacheln */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Untere Spalten */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="space-y-2 rounded-lg border border-border bg-card p-4">
              {Array.from({ length: 5 }).map((_, r) => (
                <div key={r} className="flex items-center justify-between gap-3 py-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
