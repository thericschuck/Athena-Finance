'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { berechneHinweise } from '@/lib/analyse/insights'
import type { Hinweis, HinweisTon } from '@/lib/analyse/insights'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { cn } from '@/lib/utils'

/**
 * Auffälligkeiten als EINE schmale Zeile: links das Label mit Anzahl, rechts eine waagerecht
 * scrollbare Reihe kompakter Chips (Ton-Punkt + Kurztitel). Regeln und Schwellen liegen in
 * lib/analyse/insights.ts; hier geht es nur um die Darstellung.
 *
 * Warum so: die Seite war zu lang und unruhig, Hinweise sind Beiwerk und sollen genau eine Zeile
 * kosten. Der volle Text steht in einer Detailkarte, die als Popover ÜBER dem Inhalt liegt
 * (absolute) und die Seite deshalb nie verlängert oder springen lässt.
 *
 * Bewusst kein Auto-Lauf (Marquee): bewegte Texte stören beim Lesen der Zahlen darunter und sind bei
 * prefers-reduced-motion ohnehin tabu. Stattdessen manuelles Wischen/Scrollen, am Desktop mit Pfeilen.
 *
 * Ohne Hinweise bleibt dieselbe Zeile mit „Nichts Auffälliges" stehen, damit das Layout nicht springt.
 */

const MAX_HINWEISE = 8

const PUNKT: Record<HinweisTon, { farbe: string; label: string }> = {
  positiv: { farbe: 'bg-emerald-500', label: 'Positiv' },
  neutral: { farbe: 'bg-sky-500', label: 'Zur Info' },
  warnend: { farbe: 'bg-amber-500', label: 'Achtung' },
}

export function AnalyseInsights({ daten }: AnalyseAbschnittProps) {
  const filter = useUrlFilters()
  const [offen, setOffen] = useState<string | null>(null)
  const [kannLinks, setKannLinks] = useState(false)
  const [kannRechts, setKannRechts] = useState(false)
  const wurzel = useRef<HTMLDivElement>(null)
  const reihe = useRef<HTMLUListElement>(null)
  const kartenId = useId()

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
      }).slice(0, MAX_HINWEISE),
    [daten.heute, daten.locale, daten.cutoff, daten.monatsZeilen, daten.txns, daten.fruehesterMonat, daten.categories],
  )

  // Fades und Pfeile nur dort, wo es in diese Richtung noch etwas zu scrollen gibt.
  function pruefeScroll() {
    const el = reihe.current
    if (!el) return
    setKannLinks(el.scrollLeft > 4)
    setKannRechts(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }
  useEffect(() => {
    pruefeScroll()
    const el = reihe.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(pruefeScroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hinweise])

  // Escape und Klick daneben schließen die Detailkarte.
  useEffect(() => {
    if (!offen) return
    const taste = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') setOffen(null)
    }
    const daneben = (ev: MouseEvent) => {
      if (wurzel.current && !wurzel.current.contains(ev.target as Node)) setOffen(null)
    }
    document.addEventListener('keydown', taste)
    document.addEventListener('mousedown', daneben)
    return () => {
      document.removeEventListener('keydown', taste)
      document.removeEventListener('mousedown', daneben)
    }
  }, [offen])

  // Ein geöffneter Hinweis, der nach einem Filterwechsel nicht mehr existiert, schließt sich selbst.
  const aktiv = hinweise.find(h => h.key === offen) ?? null

  function blaettern(richtung: -1 | 1) {
    const el = reihe.current
    if (el) el.scrollBy({ left: richtung * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  function pfeiltaste(ev: KeyboardEvent<HTMLUListElement>) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
    const chips = [...(reihe.current?.querySelectorAll<HTMLButtonElement>('button[data-chip]') ?? [])]
    const i = chips.findIndex(c => c === document.activeElement)
    if (i < 0) return
    ev.preventDefault()
    chips[Math.min(chips.length - 1, Math.max(0, i + (ev.key === 'ArrowRight' ? 1 : -1)))]?.focus()
  }

  function ansehen(h: Hinweis) {
    if (!h.ziel) return
    // Alle vier Schlüssel setzen: ein Hinweis ersetzt den bisherigen Drill-down, statt sich mit
    // ihm zu überlagern (sonst zeigte „Reisen im September" plus altem Partei-Filter eine leere Liste).
    filter.setMany({
      kat: h.ziel.filter.kat ?? null,
      monat: h.ziel.filter.monat ?? null,
      tag: h.ziel.filter.tag ?? null,
      partei: h.ziel.filter.partei ?? null,
    })
    setOffen(null)
    document.getElementById('buchungen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (hinweise.length === 0) {
    return (
      <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground/70" aria-label="Auffälligkeiten">
        <Check className="size-4" aria-hidden />
        Nichts Auffälliges
      </div>
    )
  }

  return (
    <div ref={wurzel} className="relative" aria-label="Auffälligkeiten" role="region">
      <div className="flex h-11 items-center gap-3">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          Auffälligkeiten <span className="tabular-nums">({hinweise.length})</span>
        </span>

        <div className="relative min-w-0 flex-1">
          <ul
            ref={reihe}
            onScroll={pruefeScroll}
            onKeyDown={pfeiltaste}
            className="flex snap-x snap-mandatory items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {hinweise.map(h => {
              const auf = h.key === aktiv?.key
              return (
                <li key={h.key} className="shrink-0 snap-start">
                  <button
                    type="button"
                    data-chip
                    aria-expanded={auf}
                    aria-controls={auf ? kartenId : undefined}
                    onClick={() => setOffen(auf ? null : h.key)}
                    className={cn(
                      'inline-flex h-10 max-w-[24rem] items-center gap-2 rounded-full border border-border bg-card px-3 text-xs',
                      'transition-colors hover:bg-muted/50 active:bg-muted',
                      auf && 'bg-muted',
                    )}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', PUNKT[h.ton].farbe)} aria-hidden />
                    <span className="sr-only">{PUNKT[h.ton].label}: </span>
                    <span className="truncate">{h.titel}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Dezente Fades; sie fangen keine Klicks ab. */}
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity',
              kannLinks ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity',
              kannRechts ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        {/* Pfeile nur am Desktop; mobil wischt man. */}
        <div className="hidden shrink-0 items-center md:flex">
          <button
            type="button"
            onClick={() => blaettern(-1)}
            disabled={!kannLinks}
            aria-label="Hinweise nach links blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => blaettern(1)}
            disabled={!kannRechts}
            aria-label="Hinweise nach rechts blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {aktiv && (
        <div
          id={kartenId}
          role="group"
          aria-label={aktiv.titel}
          className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-border bg-card p-3 shadow-lg md:left-auto md:w-[26rem] md:max-w-full"
        >
          <p className="flex items-start gap-2 text-sm font-medium leading-snug">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', PUNKT[aktiv.ton].farbe)} aria-hidden />
            {aktiv.titel}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{aktiv.text}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            {aktiv.ziel ? (
              <button
                type="button"
                onClick={() => ansehen(aktiv)}
                className="inline-flex min-h-10 items-center gap-1 rounded-md px-1 text-xs font-medium hover:underline"
              >
                {aktiv.ziel.label}
                <ArrowRight className="size-3" aria-hidden />
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOffen(null)}
              className="inline-flex min-h-10 items-center px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
