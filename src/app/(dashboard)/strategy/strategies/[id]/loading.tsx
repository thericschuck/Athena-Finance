import { Skeleton } from '@/components/ui/skeleton'

/**
 * Strategie-Detail: Zurück-Link, Kopf mit Status und Aktionen, Kennzahlen, Robustheitstests und Einreichungs-Checkliste.
 * Ersetzt für diese Seite das Tabellen-Skelett von strategy/loading.tsx.
 */
export default function Loading() {
  return (
    <div className="max-w-4xl space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <Skeleton className="h-4 w-32" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="flex items-center justify-between gap-3 py-1">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
