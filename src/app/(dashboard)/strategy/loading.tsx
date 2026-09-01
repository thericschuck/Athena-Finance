import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

/**
 * Gilt für alle Strategy-Unterseiten (Strategien, Indikatoren, Combos, Tests) — die sind
 * sich in der Silhouette gleich genug: Kopf, Filterleiste, Tabelle.
 */
export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="flex flex-wrap gap-3">
        {[128, 128, 112].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>

      <SkeletonTable rows={10} cols={[160, 96, 96, 120, 80]} />
    </div>
  )
}
