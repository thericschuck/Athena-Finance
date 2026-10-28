import { Skeleton, SkeletonChart, SkeletonTable } from '@/components/ui/skeleton'

/**
 * Ladezustand der Route, formgleich mit der fertigen Seite: Titel und Filter in einer Zeile,
 * schmale Zeilen (Zustand, Kennzahlen, offene Kategorien, Konten), Ansichts-Tabs mit dem
 * Gesamtverlauf, Trend + Kategorien, zuletzt die Buchungsliste.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4 p-4 sm:p-6 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Skeleton className="h-8 w-36" />
        <div className="flex items-center gap-3 overflow-hidden">
          <Skeleton className="h-9 w-32 shrink-0 rounded-md" />
          <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
          <Skeleton className="h-9 w-28 shrink-0 rounded-md" />
        </div>
      </div>

      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-56 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      <SkeletonChart variant="area" height={240} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart variant="bars" height={240} legend />
        <SkeletonChart variant="hbars" height={240} />
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-40 rounded-md" />
        </div>
        <SkeletonTable rows={8} cols={[72, 120, 200, 120, 80]} />
      </div>
    </div>
  )
}
