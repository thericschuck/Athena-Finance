import { SkeletonPageHeader, SkeletonRegion, SkeletonTable } from '@/components/ui/skeleton'

/**
 * Notnagel fuer Routen ohne eigene loading.tsx: neutrale Silhouette aus Seitenkopf und Tabelle.
 * Abstaende wie auf den Seiten (`p-4 sm:p-8`), damit der Wechsel nicht springt.
 */
export default function Loading() {
  return (
    <SkeletonRegion className="min-w-0 space-y-6 p-4 sm:p-8 animate-in fade-in duration-150">
      <SkeletonPageHeader />
      <SkeletonTable rows={8} cols={[96, 80, 112, 80]} />
    </SkeletonRegion>
  )
}
