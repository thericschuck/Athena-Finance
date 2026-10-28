import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/** Anlage EÜR: Kopf mit Jahreswahl und Export, dann die Zeilen der Anlage als Tabelle. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-14 rounded-md" />
          <Skeleton className="h-8 w-14 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <SkeletonTable rows={10} cols={[56, 120, 240, 96, 72]} />
    </div>
  )
}
