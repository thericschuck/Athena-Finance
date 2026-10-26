'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUrlFilters } from '@/components/providers/url-filters'
import { AVOID_ATTRIBUTE } from '@/lib/hooks/use-avoid-overlap'

/**
 * Seitenaufteilung unter der Buchungstabelle: „Seite 2 von 14 · 653 Buchungen“, Zurück/Weiter und
 * (ab sm) direkte Seitenzahlen, kurz gefasst (erste, letzte, die Nachbarn der aktuellen Seite).
 *
 * Schreibt `seite` über den UrlFiltersProvider der Seite — derselbe Weg wie alle anderen Filter, also
 * mit Fortschrittsanzeige. `seite=1` wird weggelassen. Der Provider setzt `seite` bei jedem anderen
 * Filterwechsel zurück (resetKeys="seite").
 */

/** 1 … 4 5 6 … 14: Zahlen und `null` für Auslassungspunkte. */
function seitenFolge(aktuell: number, gesamt: number): (number | null)[] {
  const gewollt = new Set([1, gesamt, aktuell - 1, aktuell, aktuell + 1])
  const zahlen = [...gewollt].filter(n => n >= 1 && n <= gesamt).sort((a, b) => a - b)
  const folge: (number | null)[] = []
  zahlen.forEach((n, i) => {
    if (i > 0 && n - zahlen[i - 1] > 1) folge.push(null)
    folge.push(n)
  })
  return folge
}

export function KontoSeiten({
  seite, seiten, gesamt, einheitSingular = 'Buchung', einheitPlural = 'Buchungen',
}: {
  seite: number
  seiten: number
  gesamt: number
  einheitSingular?: string
  einheitPlural?: string
}) {
  const { set, pending } = useUrlFilters()
  const gehe = (ziel: number) => {
    set('seite', ziel <= 1 ? null : String(ziel))
    // Nach dem Blättern an den Anfang der Liste, nicht auf der Höhe der Leiste stehen bleiben.
    document.getElementById('konto-buchungen')?.scrollIntoView({ block: 'start' })
  }

  return (
    <div
      {...{ [AVOID_ATTRIBUTE]: '' }}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3"
    >
      <p className="text-xs tabular-nums text-muted-foreground">
        {seiten > 1 ? `Seite ${seite} von ${seiten} · ` : ''}
        {gesamt.toLocaleString('de-DE')} {gesamt === 1 ? einheitSingular : einheitPlural}
      </p>

      {seiten > 1 && (
        <nav aria-label="Seiten" className="flex items-center gap-1">
          <Button
            variant="outline"
            className="min-h-10 sm:min-h-8"
            size="sm"
            disabled={seite <= 1 || pending}
            onClick={() => gehe(seite - 1)}
          >
            <ChevronLeft className="size-3.5" />
            Zurück
          </Button>

          <span className="hidden items-center gap-1 sm:flex">
            {seitenFolge(seite, seiten).map((n, i) =>
              n === null ? (
                <span key={`l${i}`} aria-hidden className="px-1 text-xs text-muted-foreground">…</span>
              ) : (
                <Button
                  key={n}
                  variant={n === seite ? 'default' : 'ghost'}
                  size="sm"
                  aria-current={n === seite ? 'page' : undefined}
                  aria-label={`Seite ${n}`}
                  disabled={pending}
                  onClick={() => gehe(n)}
                  className="min-w-8 px-2 tabular-nums"
                >
                  {n}
                </Button>
              ),
            )}
          </span>

          <Button
            variant="outline"
            className="min-h-10 sm:min-h-8"
            size="sm"
            disabled={seite >= seiten || pending}
            onClick={() => gehe(seite + 1)}
          >
            Weiter
            <ChevronRight className="size-3.5" />
          </Button>
        </nav>
      )}
    </div>
  )
}
