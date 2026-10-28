import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton'

/**
 * Platzhalter je Tab der Historie-Seite (/analyse/verlauf). Sie liegen in der Karte, die die Seite
 * um den Tab-Inhalt legt, und sind deshalb OHNE eigenen Rahmen: Kennzahlenleiste, Chart und
 * Tabelle haben dieselben Innenabstaende und Zeilenhoehen wie die fertigen Tabs.
 */

type VerlaufTab = 'networth' | 'accounts' | 'portfolio' | 'monthly'

/** Tabellenzeilen: ab sm als Spalten, am Handy als Kartenliste (wie die echten Tabs). */
function Zeilen({ rows, cols }: { rows: number; cols: number[] }) {
  return (
    <>
      <div className="hidden sm:block">
        <div className="flex gap-6 border-b border-border bg-muted/40 px-4 py-3">
          {cols.map((c, i) => <Skeleton key={i} className="h-3" style={{ width: c }} />)}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 border-b border-border/50 px-4 py-3">
            {cols.map((c, i) => <Skeleton key={i} className="h-4" style={{ width: c }} />)}
          </div>
        ))}
      </div>
      <div className="divide-y divide-border/60 sm:hidden">
        {Array.from({ length: Math.min(rows, 6) }).map((_, r) => (
          <div key={r} className="flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </>
  )
}

function KachelReihe({ count, className }: { count: number; className: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-w-0 space-y-2 rounded-lg border border-border bg-card px-4 py-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  )
}

function Pillen({ count, className }: { count: number; className?: string }) {
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
    </div>
  )
}

function NetworthSkeleton() {
  return (
    <div>
      <KachelReihe count={8} className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8" />
      <div className="px-4 pb-4">
        <Skeleton className="h-[21rem] rounded-lg border border-border sm:h-[24rem]" />
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-md" />)}
      </div>
      <Zeilen rows={10} cols={[88, 96, 72, 72, 72, 64, 72, 72]} />
    </div>
  )
}

function AccountsSkeleton() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3">
        <Pillen count={4} />
        <Skeleton className="h-8 w-48 rounded-md" />
      </div>
      <KachelReihe count={3} className="grid grid-cols-1 gap-3 border-b border-border p-3 sm:grid-cols-2 lg:grid-cols-3" />
      <Zeilen rows={10} cols={[88, 120, 88, 88, 72]} />
    </div>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="space-y-2">
        <Pillen count={5} />
        <Pillen count={6} />
      </div>
      <Skeleton className="h-64 rounded-lg border border-border" />
      <KachelReihe count={3} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" />
      <div className="overflow-hidden rounded-lg border border-border">
        <Zeilen rows={10} cols={[72, 96, 56, 56, 72, 64, 72, 72, 64]} />
      </div>
    </div>
  )
}

function MonthlySkeleton() {
  return (
    <div className="space-y-4 p-3 sm:p-4">
      <KachelReihe count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" />
      <Skeleton className="h-40 rounded-lg border border-border" />
      <Skeleton className="h-64 rounded-lg border border-border" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Zeilen rows={8} cols={[72, 88, 88, 88, 72, 72]} />
      </div>
    </div>
  )
}

/** Nur die Silhouette, ohne eigene Statusregion (fuer loading.tsx, das schon eine hat). */
export function VerlaufTabFlaeche({ tab }: { tab: VerlaufTab }) {
  return (
    <>
      {tab === 'networth' && <NetworthSkeleton />}
      {tab === 'accounts' && <AccountsSkeleton />}
      {tab === 'portfolio' && <PortfolioSkeleton />}
      {tab === 'monthly' && <MonthlySkeleton />}
    </>
  )
}

/** Suspense-Fallback des Tab-Inhalts: zeigt die Silhouette des Tabs, der gleich erscheint. */
export function VerlaufTabSkeleton({ tab }: { tab: VerlaufTab }) {
  return (
    <SkeletonRegion>
      <VerlaufTabFlaeche tab={tab} />
    </SkeletonRegion>
  )
}
