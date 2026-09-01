'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUrlFilters } from '@/components/providers/url-filters'
import { AVOID_ATTRIBUTE } from '@/lib/hooks/use-avoid-overlap'
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination'
import { cn } from '@/lib/utils'

/**
 * Blätterleiste für server-seitig paginierte Listen.
 *
 * Schreibt `page` und `per` über denselben `UrlFiltersProvider` wie die Filterleiste
 * darüber — und das ist der Grund für die Kopplung, nicht bloß Bequemlichkeit: dadurch
 * läuft der Seitenwechsel in derselben Transition, `FilterPending` blendet die Tabelle ab
 * und der Fortschrittsbalken quittiert den Klick sofort. Mit eigenen `<Link>`s wäre ein
 * Seitenwechsel die einzige Navigation der Seite ohne Rückmeldung.
 *
 * `page=1` und die Standard-Seitengröße werden als Parameter weggelassen statt gesetzt: der
 * Normalfall soll keine URL vollschreiben, die man weitergeben will.
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
  const { set, setMany, pending } = useUrlFilters()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  // `null` löscht den Parameter — siehe oben.
  const gehe = (ziel: number) => set('page', ziel <= 1 ? null : String(ziel))

  // Seitengröße ändern heißt zurück auf Seite 1: Seite 9 bei 50 Zeilen ist bei 100 Zeilen
  // schon hinter dem Ende. Beide Parameter in EINER Navigation, sonst rendert der Server
  // zweimal und einmal davon mit einem Zustand, den niemand angefordert hat.
  const setzeGroesse = (wert: string) =>
    setMany({ per: wert === String(PAGE_SIZE_OPTIONS[0]) ? null : wert, page: null })

  return (
    // Markiert sich als freizuhaltende Fläche: Athenas schwebender Knopf sitzt unten rechts
    // und lag sonst über „Weiter" und „Letzte Seite" (siehe useAvoidOverlap).
    <div
      {...{ [AVOID_ATTRIBUTE]: '' }}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="per-page" className="text-xs text-muted-foreground">
          Pro Seite
        </label>
        <select
          id="per-page"
          value={pageSize}
          disabled={pending}
          onChange={e => setzeGroesse(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {PAGE_SIZE_OPTIONS.map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground tabular-nums">
          {first}–{last} von {total}
        </span>
      </div>

      {/* Nur die Knöpfe verschwinden, wenn alles auf eine Seite passt — die Auswahl der
          Seitengröße bleibt, sonst kommt man von 100 nie wieder auf 50 zurück. */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Erste Seite"
            disabled={page <= 1 || pending}
            onClick={() => gehe(1)}
          >
            <ChevronsLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Vorherige Seite"
            disabled={page <= 1 || pending}
            onClick={() => gehe(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>

          <span className="whitespace-nowrap px-2 text-xs text-muted-foreground tabular-nums">
            Seite {page} von {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Nächste Seite"
            disabled={page >= totalPages || pending}
            onClick={() => gehe(page + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Letzte Seite"
            disabled={page >= totalPages || pending}
            onClick={() => gehe(totalPages)}
          >
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
