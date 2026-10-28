import { Skeleton, SkeletonRegion, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'

/** Rebalancing: Titel mit Untertitel, Kennzahlen, Ziel-Tabelle (Live-Preise kommen vom Server, daher dauert es). */
export default function Loading() {
  return (
    <SkeletonRegion className="space-y-8 p-4 sm:p-8 animate-in fade-in duration-150">
      <div>
        <Skeleton className="h-8 w-40" />
        <div className="mt-0.5 flex h-5 items-center">
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
      </div>
      <SkeletonStatCards count={3} />
      <SkeletonTable rows={6} cols={[120, 80, 80, 96, 80]} />
    </SkeletonRegion>
  )
}
