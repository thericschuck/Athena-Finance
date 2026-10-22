import { Skeleton } from '@/components/ui/skeleton'

/** Einstellungsformular: Abschnitte mit Beschriftung und Feld, darunter ein größeres Textfeld und der Speichern-Knopf. */
export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-150">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full max-w-sm rounded-md" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
      <Skeleton className="h-9 w-28 rounded-md" />
    </div>
  )
}
