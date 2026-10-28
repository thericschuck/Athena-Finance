'use client'

import { useId, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, X } from 'lucide-react'
import { toast } from 'sonner'
import { blendeChecklisteAus } from '@/app/(dashboard)/dashboard/checkliste-actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErsteSchritteListe } from './ErsteSchritteListe'
import type { ChecklisteAnsicht } from '@/lib/leer/erste-schritte'

/**
 * Ausgeblendet-Zustand, geteilt von allen Instanzen der Karte: das Dashboard rendert sie zweimal (oben fuer
 * Handy/Tablet, in der rechten Spalte ab lg; je eine per CSS versteckt). Schliessen blendet damit beide aus.
 */
const hoerer = new Set<() => void>()
let ausgeblendet = false
const setzeAus = (v: boolean) => { ausgeblendet = v; hoerer.forEach(f => f()) }
// Sind beide Instanzen weg (Seitenwechsel), wird zurueckgesetzt: der naechste Besuch richtet sich nach dem Server-Vermerk.
const abonniere = (f: () => void) => {
  hoerer.add(f)
  return () => { hoerer.delete(f); if (hoerer.size === 0) ausgeblendet = false }
}

/**
 * Kompakte Karte "Erste Schritte" im Dashboard (Handy/Tablet unter den Hinweisen, ab lg in der rechten Spalte
 * von Zeile 2; `schmal` fuer die Spalte: Button volle Breite, ohne Beschreibung). Zugeklappt: Kopfzeile mit Fortschritt und Schliessen-Button,
 * der naechste offene Schritt mit seiner Aktion, und der Aufklapper "Alle Schritte anzeigen" (Standard: zu).
 * Schliessen blendet sofort aus (optimistisch) und speichert den Vermerk serverseitig (geraeteuebergreifend);
 * schlaegt das Speichern fehl, erscheint die Karte wieder und ein Hinweis erklaert es.
 */
export function ErsteSchritteKarte({ ansicht, schmal = false }: { ansicht: ChecklisteAnsicht; schmal?: boolean }) {
  const aus = useSyncExternalStore(abonniere, () => ausgeblendet, () => false)
  const setAus = setzeAus
  const [offen, setOffen] = useState(false)
  const [, start] = useTransition()
  const listeId = useId()
  if (aus) return null

  const { schritte, naechster, fortschritt: f, willkommen } = ansicht
  const ausblenden = () => {
    setAus(true)
    start(async () => {
      let ok = false
      try { ok = 'success' in (await blendeChecklisteAus()) } catch { /* Netzfehler: wie Fehlschlag */ }
      if (!ok) { setAus(false); toast.error('Die Checkliste konnte nicht ausgeblendet werden. Versuch es noch einmal.') }
    })
  }

  return (
    <section aria-label="Erste Schritte" className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{willkommen ? 'Willkommen – so legst du los' : 'Erste Schritte'}</h2>
          <div className="mt-1.5 flex items-center gap-3">
            <span
              role="progressbar"
              aria-valuenow={f.prozent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${f.erledigt} von ${f.gesamt} Schritten erledigt`}
              className="block h-1.5 min-w-0 max-w-48 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${f.prozent}%` }} />
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.erledigt} von {f.gesamt}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={ausblenden}
          aria-label="Checkliste ausblenden"
          className="-my-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className={cn('mt-3 flex flex-col gap-3', !schmal && 'sm:flex-row sm:items-center sm:justify-between')}>
        <div className="min-w-0">
          <p className="text-sm font-medium">{naechster.titel}</p>
          {!schmal && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{naechster.text}</p>}
        </div>
        <Button asChild size="sm" className={cn('w-full shrink-0', !schmal && 'sm:w-auto')}>
          <Link href={naechster.href}>{naechster.aktion}</Link>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        aria-controls={listeId}
        className="mt-2 -mb-2 inline-flex min-h-10 items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {offen ? 'Weniger anzeigen' : 'Alle Schritte anzeigen'}
        <ChevronDown className={cn('size-4 transition-transform', offen && 'rotate-180')} aria-hidden />
      </button>
      {offen && (
        <div id={listeId} className="mt-3 border-t border-border pt-3">
          <ErsteSchritteListe schritte={schritte} ohneFortschritt />
        </div>
      )}
    </section>
  )
}
