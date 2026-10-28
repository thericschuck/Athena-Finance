import { Skeleton } from '@/components/ui/skeleton'

/**
 * Gilt für den Chat (`/assistant`). Die Unterseiten Erinnerungen, Wissen, Logs und Einstellungen haben ein eigenes
 * Skelett: sie sind Listen bzw. Formulare, nicht Chat.
 *
 * Der Rahmen (Kopf mit Avatar und Navigation) kommt aus assistant/layout.tsx und steht sofort da; hier nur die
 * Fläche darunter: Session-Liste links, Verlauf und Eingabefeld rechts.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="grid h-full min-h-0 grid-cols-1 gap-4 animate-in fade-in duration-150 lg:grid-cols-[16rem_1fr]">
      <span className="sr-only">Lädt…</span>
      <aside className="hidden min-h-0 space-y-3 rounded-lg border border-border p-3 lg:block">
        <Skeleton className="h-8 w-full rounded-md" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5 py-1">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        ))}
      </aside>

      <div className="flex min-h-0 flex-col justify-between gap-6 overflow-hidden rounded-lg border border-border p-4">
        <div className="space-y-5">
          <div className="flex justify-end">
            <Skeleton className="h-10 w-2/5 rounded-2xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  )
}
