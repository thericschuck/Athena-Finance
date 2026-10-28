import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-3 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <Skeleton className="h-[4.5rem] w-full rounded-lg sm:h-16" />
      <div className="flex flex-wrap items-center gap-2">
        {[48, 56, 88, 64].map((w, i) => (
          <Skeleton key={i} className="h-10 rounded-full" style={{ width: w }} />
        ))}
        <Skeleton className="ml-auto h-10 w-40 rounded-md" />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2 px-3 py-2.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
