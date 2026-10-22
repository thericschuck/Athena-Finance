import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/** Vertrags-Detail: Zurück-Link, Kopf mit Aktionen, Kennzahlenraster und die Buchungen des Vertrags. */
export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <Skeleton className="h-4 w-28" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <SkeletonTable rows={6} cols={[80, 200, 96, 72]} />
      </div>
    </div>
  )
}
