import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Ladezustand der Route, formgleich mit dem fertigen Dashboard: Titel, schmale Kennzahlenleiste,
 * Hinweis- und Zustandszeile, Verlauf mit „Als Nächstes", Monat/Ausblick/Aufteilung, je eine
 * Reihe Konten und Anlagen, Sparziele und Fixkosten. Abstände wie dort (`p-4 sm:p-6`, `space-y-4`).
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SkeletonChart variant="area" height={320} className="lg:col-span-2" />
        <SkeletonChart variant="hbars" height={320} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SkeletonChart variant="hbars" height={240} />
        <SkeletonChart variant="area" height={240} />
        <SkeletonChart variant="donut" height={240} />
      </div>

      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-56 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart variant="hbars" height={220} />
        <SkeletonChart variant="hbars" height={220} />
      </div>
    </div>
  )
}
