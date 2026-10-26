import { Skeleton } from '@/components/ui/skeleton'

/** Vertrags-Detail: Zurück-Link, Kopf mit Aktionen, Kennzahlenleiste, Stammdaten und Abbuchungsverlauf. */
export default function Loading() {
  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <Skeleton className="h-4 w-28" />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52 max-w-full" />
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
        <Skeleton className="h-10 w-20 shrink-0 rounded-md" />
      </div>

      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />

      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3 px-3 py-3 sm:px-4">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
