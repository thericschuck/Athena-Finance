import { Skeleton } from '@/components/ui/skeleton'

/** Einstellungen: Reiterzeile, darunter zwei Abschnittskarten und die Speicherleiste. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex max-w-3xl flex-col gap-4 animate-in fade-in duration-150">
      <span className="sr-only">Lädt…</span>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-10 w-28 rounded-md" />
    </div>
  )
}
