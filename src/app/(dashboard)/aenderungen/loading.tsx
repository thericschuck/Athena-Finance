import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton'

/**
 * Ladezustand der Aenderungen: Titel mit zweizeiligem Hinweis, Filterkarte (vier Felder) und die
 * Liste der Eintraege (Wann / Wer / Was).
 */
export default function Loading() {
  return (
    <SkeletonRegion className="min-w-0 space-y-4 p-4 sm:p-8 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-full max-w-xl" />
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex gap-6 border-b border-border px-3 py-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-12" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-3 py-2">
            <Skeleton className="h-4 w-16 shrink-0" />
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}
