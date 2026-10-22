import { Skeleton, SkeletonCardList } from '@/components/ui/skeleton'

/** Gilt auch für „Wissen" (re-exportiert): beide sind eine Kopfzeile mit Aktion über einer Liste von Karten. */
export default function Loading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <SkeletonCardList rows={6} />
    </div>
  )
}
