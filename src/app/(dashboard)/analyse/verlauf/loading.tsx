import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton'
import { VerlaufTabFlaeche } from '@/components/verlauf/VerlaufSkeletons'

/**
 * Ladezustand der Historie: Titel + Untertitel, Tab-Leiste (vier Reiter mit Unterstrich, wie die
 * Seite) und die Karte mit dem Platzhalter des Standard-Tabs (Net Worth).
 */
export default function Loading() {
  return (
    <SkeletonRegion className="max-w-[1400px] space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <div>
        <Skeleton className="h-8 w-28" />
        <div className="mt-0.5 flex h-5 items-center">
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[64, 56, 64, 112].map((w, i) => (
          <div key={i} className="px-4 py-2">
            <Skeleton className="h-5" style={{ width: w }} />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <VerlaufTabFlaeche tab="networth" />
      </div>
    </SkeletonRegion>
  )
}
