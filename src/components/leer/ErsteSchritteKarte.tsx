'use client'

import { useId, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, ListChecks, Rocket, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { blendeChecklisteAus } from '@/app/(dashboard)/dashboard/checkliste-actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErsteSchritteListe } from './ErsteSchritteListe'
import { karteTexte, type ChecklisteAnsicht } from '@/lib/leer/erste-schritte'

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

  const t = karteTexte(ansicht)
  const Icon = t.grundlagenFertig ? Sparkles : willkommen ? Rocket : ListChecks
  const prozent = Math.min(100, Math.max(0, Number.isFinite(f.prozent) ? f.prozent : 0))

  return (
    <section
      aria-label="Erste Schritte"
      className="erste-schritte-ein relative min-w-0 overflow-hidden rounded-xl border border-primary/40 bg-card bg-linear-to-br from-primary/10 via-card to-card p-4 pl-5 shadow-sm"
    >
      {/* Akzentstreifen in Primaerfarbe */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn('font-semibold leading-tight', schmal ? 'text-base' : 'text-lg')}>{t.titel}</h2>
          {t.untertitel && <p className="mt-0.5 text-sm">{t.untertitel}</p>}
        </div>
        <button
          type="button"
          onClick={ausblenden}
          aria-label="Checkliste ausblenden"
          className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span
          role="progressbar"
          aria-valuenow={prozent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${f.erledigt} von ${f.gesamt} Schritten erledigt`}
          className="block h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border"
        >
          <span className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${prozent}%` }} />
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{t.prozentText}</span>
      </div>
      <p className="mt-1 text-xs tabular-nums">{f.erledigt} von {f.gesamt} erledigt</p>

      <div className={cn('mt-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-3', !schmal && 'sm:flex-row sm:items-center sm:justify-between')}>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide">{t.naechsterLabel}</p>
          <p className="mt-0.5 text-sm font-semibold">{naechster.titel}</p>
          {!schmal && <p className="mt-0.5 line-clamp-2 text-sm">{naechster.text}</p>}
        </div>
        <Button asChild size="lg" className={cn('es-aktion w-full shrink-0', !schmal && 'sm:w-auto')}>
          <Link href={naechster.href}>{naechster.aktion}</Link>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        aria-controls={listeId}
        className="mt-3 -mb-2 inline-flex min-h-10 items-center gap-1 rounded-md text-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
