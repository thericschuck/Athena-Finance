import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

/** Gilt auch für „Wissen" (re-exportiert): beide sind eine Kopfleiste (Suche, Info, Neu), Chips und eine Kartenliste. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-3 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="size-10 rounded-md" />
        <Skeleton className="h-10 w-20 rounded-md" />
      </div>
      <div className="flex gap-2">
        {[44, 76, 60, 56].map((w, i) => (
          <Skeleton key={i} className="h-10 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <SkeletonCardList rows={5} className="space-y-2" />
    </div>
  )
}
