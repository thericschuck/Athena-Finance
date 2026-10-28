import { Skeleton } from '@/components/ui/skeleton'

/** Ladezustand mit der Struktur der Seite: Kopf, Filterzeile, Kennzahlenleiste, Liste mit Tageskopf. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 w-full rounded-md sm:order-last sm:h-8 sm:w-44" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-md sm:h-8" />
            <Skeleton className="h-10 w-24 rounded-md sm:h-8" />
            <Skeleton className="h-10 w-24 rounded-md sm:h-8" />
          </div>
        </div>
      </div>

      {/* Filterzeile */}
      <div className="flex flex-wrap gap-2">
        {[200, 88, 88, 88, 96].map((w, i) => (
          <Skeleton key={i} className="h-8 max-w-full rounded-md" style={{ width: w }} />
        ))}
      </div>

      {/* Kennzahlenleiste */}
      <Skeleton className="h-14 w-full rounded-lg" />

      {/* Liste: zwei Tage */}
      <div className="rounded-lg border border-border bg-card">
        {[3, 4].map((n, g) => (
          <div key={g} className="border-t border-border first:border-t-0">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3 max-w-xs" />
                    <Skeleton className="h-3 w-1/3 max-w-[8rem]" />
                  </div>
                  <Skeleton className="hidden h-6 w-28 rounded-full md:block" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
