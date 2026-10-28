import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Ladezustand der Route, formgleich mit der fertigen Seite: Titel und Filter in einer Zeile,
 * schmale Kennzahlenleiste, schmale Auffaelligkeiten-Zeile, Ansichts-Tabs und darunter der
 * Ueberblick (Geldfluss, Kategorien + Gegenparteien), zuletzt die Buchungsliste.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4 p-4 sm:p-6 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Skeleton className="h-8 w-28" />
        <div className="flex items-center gap-3 overflow-hidden">
          <Skeleton className="h-9 w-32 shrink-0 rounded-md" />
          <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
          <div className="flex shrink-0 gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-11 rounded" />
            ))}
          </div>
        </div>
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      <SkeletonChart variant="area" height={360} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart variant="hbars" height={260} />
        <SkeletonChart variant="hbars" height={260} />
      </div>
    </div>
  )
}
