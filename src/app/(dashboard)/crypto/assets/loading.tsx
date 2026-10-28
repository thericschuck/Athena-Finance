import { Skeleton, SkeletonRegion, SkeletonTable } from '@/components/ui/skeleton'

/** Asset-Katalog: Titel mit Untertitel, darunter der Katalog als Tabelle. */
export default function Loading() {
  return (
    <SkeletonRegion className="space-y-8 p-4 sm:p-8 animate-in fade-in duration-150">
      <div>
        <Skeleton className="h-8 w-44" />
        <div className="mt-0.5 flex h-5 items-center">
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      </div>
      <SkeletonTable rows={8} cols={[96, 64, 120, 80]} />
    </SkeletonRegion>
  )
}
