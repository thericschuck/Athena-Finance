'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { berechneHinweise } from '@/lib/analyse/insights'
import type { Hinweis, HinweisTon } from '@/lib/analyse/insights'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { cn } from '@/lib/utils'

/**
 * Auffälligkeiten: berechnete Hinweise aus den Zahlen der Seite (Regeln und Schwellen in
 * lib/analyse/insights.ts, keine KI). Eigene Client-Komponente, weil ein Klick auf einen Hinweis
 * die URL-Filter setzt (Kategorie/Monat/Tag/Partei) und zur Buchungsliste springt.
 *
 * Die Berechnung läuft hier im Browser auf den Props, die die Seite ohnehin schon hat; sie ist
 * billig (ein paar Hundert Zeilen) und spart eine zweite Server-Runde.
 *
 * Wenn nichts auffällt, bleibt es bei einer schmalen Zeile: ein leerer Kasten würde Aufmerksamkeit
 * für etwas beanspruchen, das gerade gut aussieht.
 */

const MAX_SICHTBAR = 5

const TON: Record<HinweisTon, { balken: string; label: string }> = {
  positiv: { balken: 'bg-emerald-500', label: 'Positiv' },
  neutral: { balken: 'bg-sky-500', label: 'Zur Info' },
  warnend: { balken: 'bg-amber-500', label: 'Achtung' },
}

export function AnalyseInsights({ daten }: AnalyseAbschnittProps) {
  const filter = useUrlFilters()
  const [alle, setAlle] = useState(false)

  const hinweise = useMemo(
    () =>
      berechneHinweise({
        heute: daten.heute,
        locale: daten.locale,
        cutoff: daten.cutoff,
        monatsZeilen: daten.monatsZeilen,
        txns: daten.txns,
        fruehesterMonat: daten.fruehesterMonat,
        // Neutrale Hauptkategorien (Transfers u. ä.) sind keine Konsumausgabe und kein Hinweis wert.
        neutraleKategorien: daten.categories.filter(c => c.type === 'neutral').map(c => c.id),
      }),
    [daten.heute, daten.locale, daten.cutoff, daten.monatsZeilen, daten.txns, daten.fruehesterMonat, daten.categories],
  )

  if (hinweise.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" aria-label="Auffälligkeiten">
        Nichts Auffälliges
      </p>
    )
  }

  const sichtbar = alle ? hinweise : hinweise.slice(0, MAX_SICHTBAR)
  const rest = hinweise.length - MAX_SICHTBAR

  function oeffne(h: Hinweis) {
    if (!h.ziel) return
    // Alle vier Schlüssel setzen: ein Hinweis ersetzt den bisherigen Drill-down, statt sich mit
    // ihm zu überlagern (sonst zeigte „Reisen im September" plus altem Partei-Filter eine leere Liste).
    filter.setMany({
      kat: h.ziel.filter.kat ?? null,
      monat: h.ziel.filter.monat ?? null,
      tag: h.ziel.filter.tag ?? null,
      partei: h.ziel.filter.partei ?? null,
    })
    document.getElementById('buchungen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section aria-label="Auffälligkeiten" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Auffälligkeiten</h2>
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setAlle(a => !a)}
            className="inline-flex min-h-10 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={alle}
          >
            {alle ? 'Weniger anzeigen' : `Mehr anzeigen (${rest})`}
            {alle ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>

      {/* Mobil eine Reihe zum Wischen (snap), ab md Raster. Der Scroll-Container ist die Reihe selbst,
          nicht die Seite: kein horizontaler Seiten-Scroll bei 360 px. */}
      <ul
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
          'md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-3',
        )}
      >
        {sichtbar.map(h => (
          <li key={h.key} className="w-[17rem] shrink-0 snap-start md:w-auto">
            <HinweisKarte hinweis={h} onOpen={() => oeffne(h)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function HinweisKarte({ hinweis: h, onOpen }: { hinweis: Hinweis; onOpen: () => void }) {
  const ton = TON[h.ton]
  const inhalt = (
    <>
      <span className={cn('absolute inset-y-0 left-0 w-1', ton.balken)} aria-hidden />
      <span className="sr-only">{ton.label}: </span>
      <span className="block text-sm font-medium leading-snug">{h.titel}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{h.text}</span>
      {h.ziel && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-foreground/80">
          {h.ziel.label}
          <ArrowRight className="size-3" aria-hidden />
        </span>
      )}
    </>
  )
  const klassen = 'relative block h-full w-full overflow-hidden rounded-lg border border-border bg-card py-3 pl-4 pr-3 text-left'
  return h.ziel ? (
    <button
      type="button"
      onClick={onOpen}
      className={cn(klassen, 'min-h-10 transition-colors hover:bg-muted/50 active:bg-muted')}
    >
      {inhalt}
    </button>
  ) : (
    <div className={klassen}>{inhalt}</div>
  )
}
