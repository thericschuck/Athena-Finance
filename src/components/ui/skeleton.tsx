import { cn } from '@/lib/utils'

/**
 * Basis-Platzhalter für Ladezustände. Nutzt die `.shimmer`-Klasse aus globals.css, damit
 * jeder Ladezustand der App dieselbe Animation hat statt an jeder Stelle ein eigenes
 * `animate-pulse`.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('shimmer rounded-md', className)} {...props} />
}

/** Mehrere Textzeilen mit unterschiedlicher Breite — liest sich als Absatz, nicht als Block. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['100%', '92%', '78%', '85%', '64%']
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────────
//
// Ein leerer grauer Kasten sagt nur "hier ist nichts". Deshalb bekommt jeder Chart-
// Platzhalter die Silhouette des Charts, der gleich erscheint — Balken bleiben Balken,
// eine Fläche bleibt eine Fläche. Alle Werte sind fest verdrahtet (kein Math.random),
// sonst würde Server- und Client-Render auseinanderlaufen.

const BAR_HEIGHTS = [46, 68, 34, 82, 55, 73, 40, 61, 88, 50, 66, 38]

/** Silhouette einer Flächen-/Linienkurve, als clip-path über den Shimmer gelegt. */
const AREA_CLIP =
  'polygon(0% 82%, 7% 70%, 14% 74%, 21% 55%, 28% 60%, 35% 41%, 42% 48%, 50% 30%, ' +
  '58% 38%, 65% 26%, 72% 34%, 79% 20%, 86% 28%, 93% 14%, 100% 22%, 100% 100%, 0% 100%)'

export type SkeletonChartVariant = 'bars' | 'area' | 'hbars' | 'donut'

interface SkeletonChartProps {
  /** Welche Chart-Form nachgezeichnet wird. */
  variant?: SkeletonChartVariant
  /** Höhe der Zeichenfläche in px — sollte der Höhe des echten Charts entsprechen. */
  height?: number
  /** Platzhalter für die Chart-Überschrift zeigen. */
  title?: boolean
  /** Zweiter Platzhalter rechts in der Kopfzeile (z. B. Summen/Legende). */
  legend?: boolean
  className?: string
}

export function SkeletonChart({
  variant = 'bars',
  height = 220,
  title = true,
  legend = false,
  className,
}: SkeletonChartProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5', className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-44" />
          {legend && (
            <div className="flex gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          )}
        </div>
      )}
      <SkeletonChartBody variant={variant} height={height} />
    </div>
  )
}

/** Nur die Zeichenfläche — für Stellen, die ihre eigene Card/Überschrift mitbringen. */
export function SkeletonChartBody({
  variant = 'bars',
  height = 220,
}: {
  variant?: SkeletonChartVariant
  height?: number
}) {
  if (variant === 'donut') {
    const size = Math.min(height, 200)
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <Skeleton className="size-full rounded-full" />
          {/* Loch in der Mitte — macht aus dem Kreis einen Ring */}
          <div className="absolute inset-[26%] rounded-full bg-card" />
        </div>
      </div>
    )
  }

  if (variant === 'hbars') {
    const widths = [92, 74, 58, 44, 30, 22]
    return (
      <div className="flex flex-col justify-center gap-3" style={{ height }}>
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-20 shrink-0" />
            <Skeleton className="h-4 rounded-sm" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'area') {
    return (
      <div className="flex gap-3" style={{ height }}>
        {/* Y-Achse */}
        <div className="flex w-12 shrink-0 flex-col justify-between py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-full" />
          ))}
        </div>
        <div className="relative flex-1">
          <Skeleton className="size-full rounded-none" style={{ clipPath: AREA_CLIP }} />
        </div>
      </div>
    )
  }

  // 'bars'
  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="flex w-12 shrink-0 flex-col justify-between py-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-full" />
        ))}
      </div>
      <div className="flex flex-1 items-end gap-[3%]">
        {BAR_HEIGHTS.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

// ── Karten & Tabellen ─────────────────────────────────────────────────────────

/** Raster aus Kennzahl-Karten (Kontostände, KPI-Kacheln …). */
export function SkeletonStatCards({
  count = 3,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      ))}
    </div>
  )
}

/**
 * Tabellen-Platzhalter mit Kopfzeile und Zeilen. `cols` sind Pixelbreiten; die vorletzte
 * Spalte wächst mit (`flex-1`), damit der Platzhalter so breit wird wie die echte Tabelle.
 */
export function SkeletonTable({
  rows = 8,
  cols = [64, 96, 128, 80, 64],
  className,
}: {
  rows?: number
  cols?: number[]
  className?: string
}) {
  const growIndex = Math.max(0, cols.length - 2)
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="flex gap-6 border-b border-border bg-muted/40 px-4 py-3">
        {cols.map((c, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === growIndex && 'flex-1')}
            style={i === growIndex ? undefined : { width: c }}
          />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 py-3.5">
            {cols.map((c, i) => (
              <Skeleton
                key={i}
                className={cn('h-4', i === growIndex && 'flex-1')}
                style={i === growIndex ? undefined : { width: c }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Kopfbereich einer Seite: Titel, Untertitel und Aktions-Buttons rechts. */
export function SkeletonPageHeader({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-md" />
        ))}
      </div>
    </div>
  )
}

/** Liste aus Zeilen-Karten (Verträge, Ziele, Schulden …). */
export function SkeletonCardList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-24 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Ein Raster aus Filter-/Toolbar-Pillen (Zeitraum-Buttons, Tabs …). */
export function SkeletonToolbar({ pills = 4 }: { pills?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-3 w-16" />
      <div className="flex gap-1">
        {Array.from({ length: pills }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-12 rounded-full" />
        ))}
      </div>
    </div>
  )
}
