'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUrlFilters } from '@/components/providers/url-filters'
import { cn } from '@/lib/utils'

/**
 * Blätterleiste für server-seitig paginierte Listen.
 *
 * Schreibt `page` über denselben `UrlFiltersProvider` wie die Filterleiste darüber — und
 * das ist der Grund für diese Kopplung und nicht bloß Bequemlichkeit: dadurch läuft der
 * Seitenwechsel in derselben Transition, `FilterPending` blendet die Tabelle ab und der
 * Fortschrittsbalken quittiert den Klick sofort. Mit eigenen `<Link>`s wäre ein
 * Seitenwechsel die einzige Navigation auf der Seite ohne Rückmeldung.
 *
 * `page=1` wird als Parameter weggelassen, nicht auf `1` gesetzt: die erste Seite ist der
 * Normalfall, und eine URL ohne Ballast lässt sich weitergeben.
 *
 * Der Provider gehört mit `resetKeys="page"` konfiguriert — dann setzt jede Filteränderung
 * automatisch auf Seite 1 zurück, sonst landet man im Nichts.
 */
export function UrlPagination({
  page,
  pageSize,
  total,
  className,
}: {
  /** Aktuelle Seite, 1-basiert. */
  page: number
  pageSize: number
  /** Gesamtzahl der Treffer über alle Seiten. */
  total: number
  className?: string
}) {
  const { set, pending } = useUrlFilters()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Passt alles auf eine Seite, ist die Leiste nur Rauschen.
  if (totalPages <= 1) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  // `null` löscht den Parameter — siehe oben.
  const go = (ziel: number) => set('page', ziel <= 1 ? null : String(ziel))

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {first}–{last} von {total}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Erste Seite"
          disabled={page <= 1 || pending}
          onClick={() => go(1)}
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Vorherige Seite"
          disabled={page <= 1 || pending}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>

        <span className="px-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          Seite {page} von {totalPages}
        </span>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Nächste Seite"
          disabled={page >= totalPages || pending}
          onClick={() => go(page + 1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Letzte Seite"
          disabled={page >= totalPages || pending}
          onClick={() => go(totalPages)}
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
