import { Skeleton } from '@/components/ui/skeleton'

/** Projektliste: eine Aktionszeile, darunter ein Rahmen mit Zeilen. */
export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-3 animate-in fade-in duration-150">
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5 px-3 py-3">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
