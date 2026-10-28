import { Skeleton } from '@/components/ui/skeleton'

/** Verträge: Kopf, schmale Kennzahlenleiste, Ansichts-Chips und die Zeilen der Fixkosten. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="min-w-0 space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0 rounded-md sm:w-36" />
      </div>

      <Skeleton className="h-14 w-full rounded-lg" />

      <div className="flex gap-2">
        {[16, 24, 24].map((w, i) => <Skeleton key={i} className="h-10 rounded-full md:h-8" style={{ width: `${w * 4}px` }} />)}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5 px-3 py-3 sm:px-4">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-40 max-w-[55%]" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-56 max-w-[80%]" />
              <Skeleton className="h-3 w-44 max-w-[60%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
