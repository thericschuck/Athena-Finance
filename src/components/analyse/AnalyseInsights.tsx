'use client'

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
 * Lauf: die Reihe läuft langsam (LAUF_PX_PRO_SEKUNDE) von rechts nach links durch, per
 * requestAnimationFrame auf `scrollLeft` (nicht per transform): so bleibt manuelles Wischen mit dem Finger
 * und Scrollen mit den Pfeilen ohne Umbau möglich. Die Position wird als Kommazahl selbst geführt, weil
 * Browser `scrollLeft` bei 0,5 px je Frame sonst auf ganze Pixel runden und der Lauf stehen bliebe.
 * Nahtlos wird er durch eine zweite Kopie der Chips (aria-hidden, nicht per Tab erreichbar):
 * erreicht die Position die Breite der ersten Kopie, springt sie um genau diese zurück — identischer
 * Inhalt, also kein sichtbarer Sprung. Der Lauf steht still, wenn alles in die Zeile passt, bei
 * prefers-reduced-motion (dann bleibt es beim manuellen Blättern), bei Hover, Tastaturfokus,
 * geöffneter Detailkarte, Berührung (bis 2 s danach) und im Hintergrund-Tab.
 *
 * Ohne Hinweise bleibt dieselbe Zeile mit „Nichts Auffälliges" stehen, damit das Layout nicht springt.
 */

const MAX_HINWEISE = 8
const LAUF_PX_PRO_SEKUNDE = 28
const PAUSE_NACH_EINGRIFF_MS = 2000
/** Abstand zwischen den Chips (`gap-2`); wird für die exakte Schleifenlänge gebraucht. */
const CHIP_ABSTAND = 8
/** Breite der Detailkarte am Desktop (26rem); mobil und in schmalen Zeilen die volle Zeilenbreite. */
const KARTE_BREITE = 416
const KARTE_AB_BREITE = '(min-width: 768px)'

interface KartePos {
  left: number
  breite: number
  /** Mitte des Chips, relativ zur Karte (für das kleine Dreieck). */
  pfeil: number
}

const PUNKT: Record<HinweisTon, { farbe: string; label: string }> = {
  positiv: { farbe: 'bg-emerald-500', label: 'Positiv' },
  neutral: { farbe: 'bg-sky-500', label: 'Zur Info' },
  warnend: { farbe: 'bg-amber-500', label: 'Achtung' },
}

const REDUZIERT = '(prefers-reduced-motion: reduce)'
function abonniereReduziert(cb: () => void) {
  const mq = window.matchMedia(REDUZIERT)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const reduziertJetzt = () => window.matchMedia(REDUZIERT).matches

export function AnalyseInsights({ daten }: AnalyseAbschnittProps) {
  const filter = useUrlFilters()
  const [offen, setOffen] = useState<string | null>(null)
  const [kannLinks, setKannLinks] = useState(false)
  const [kannRechts, setKannRechts] = useState(false)
  // Serverseitig (und bis zur Hydration) reduziert: erst im Browser startet der Lauf.
  const reduziert = useSyncExternalStore(abonniereReduziert, reduziertJetzt, () => true)
  const [breit, setBreit] = useState(false)
  const laeuft = !reduziert && breit
  const [kartePos, setKartePos] = useState<KartePos | null>(null)
  const chipRef = useRef<HTMLElement | null>(null)
  const pause = useRef({ hover: false, fokus: false, karte: false, beruehrt: false, bis: 0 })
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
  // Länge der ersten Kopie (ohne Abstand am Ende); größer als die Zeile = es gibt etwas zu laufen.
  function kopieBreite(): number {
    const chips = reihe.current?.querySelectorAll<HTMLElement>('li[data-k="1"]')
    if (!chips || chips.length === 0) return 0
    return chips[chips.length - 1].getBoundingClientRect().right - chips[0].getBoundingClientRect().left
  }
  useEffect(() => {
    const messen = () => {
      pruefeScroll()
      const el = reihe.current
      if (el) setBreit(kopieBreite() > el.clientWidth + 1)
    }
    messen()
    const el = reihe.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(messen)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hinweise])

  // Der Lauf selbst. Aufräumen: Frame abbrechen (Listener hängen als React-Props am Element).
  const karteOffen = offen !== null
  useEffect(() => {
    pause.current.karte = karteOffen
  }, [karteOffen])
  useEffect(() => {
    const el = reihe.current
    if (!laeuft || !el) return
    let pos = el.scrollLeft
    let letzte: number | null = null
    let warPause = false
    let frame = 0
    const schritt = (t: number) => {
      frame = requestAnimationFrame(schritt)
      const p = pause.current
      const steht = p.hover || p.fokus || p.karte || p.beruehrt || t < p.bis || document.hidden
      if (steht) {
        warPause = true
        letzte = null
        return
      }
      if (warPause) {
        pos = el.scrollLeft // Nutzer hat evtl. gescrollt: dort weiterlaufen
        warPause = false
      }
      const dt = letzte === null ? 0 : Math.min(t - letzte, 100)
      letzte = t
      const laenge = kopieBreite() + CHIP_ABSTAND
      pos += (LAUF_PX_PRO_SEKUNDE * dt) / 1000
      if (pos >= laenge) pos -= laenge
      el.scrollLeft = pos
    }
    frame = requestAnimationFrame(schritt)
    return () => cancelAnimationFrame(frame)
  }, [laeuft, hinweise])

  // Karte unter den angeklickten Chip setzen, auf die Zeile geklemmt. Mobil volle Zeilenbreite.
  function messeKarte() {
    const chip = chipRef.current
    const box = wurzel.current
    if (!chip || !box) return
    const c = chip.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const breite = window.matchMedia(KARTE_AB_BREITE).matches ? Math.min(KARTE_BREITE, b.width) : b.width
    const left = Math.min(Math.max(0, c.left - b.left), Math.max(0, b.width - breite))
    const mitte = c.left + c.width / 2 - b.left - left
    setKartePos({ left, breite, pfeil: Math.min(Math.max(16, mitte), breite - 16) })
  }
  function umschalten(key: string, chip: HTMLElement) {
    if (offen === key) {
      setOffen(null)
      return
    }
    chipRef.current = chip
    messeKarte()
    setOffen(key)
  }
  // Bei Größenänderung oder Scrollen der Reihe neu messen, solange die Karte offen ist.
  useEffect(() => {
    if (!offen) return
    const el = reihe.current
    window.addEventListener('resize', messeKarte)
    el?.addEventListener('scroll', messeKarte)
    return () => {
      window.removeEventListener('resize', messeKarte)
      el?.removeEventListener('scroll', messeKarte)
    }
  }, [offen])

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
    if (!el) return
    pause.current.bis = performance.now() + PAUSE_NACH_EINGRIFF_MS
    // Im Lauf ist links nie zu Ende: eine Kopie nach rechts rücken (gleicher Inhalt, unsichtbar).
    if (laeuft && richtung === -1 && el.scrollLeft < el.clientWidth) el.scrollLeft += kopieBreite() + CHIP_ABSTAND
    el.scrollBy({ left: richtung * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  function pfeiltaste(ev: KeyboardEvent<HTMLUListElement>) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
    const chips = [...(reihe.current?.querySelectorAll<HTMLButtonElement>('li[data-k="1"] button') ?? [])]
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

        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          onPointerEnter={ev => { if (ev.pointerType === 'mouse') pause.current.hover = true }}
          onPointerLeave={() => { pause.current.hover = false }}
        >
          <ul
            ref={reihe}
            onScroll={pruefeScroll}
            onKeyDown={pfeiltaste}
            onFocus={() => { pause.current.fokus = true }}
            onBlur={() => { pause.current.fokus = false }}
            onTouchStart={() => { pause.current.beruehrt = true }}
            onTouchEnd={() => { pause.current.beruehrt = false; pause.current.bis = performance.now() + PAUSE_NACH_EINGRIFF_MS }}
            onTouchCancel={() => { pause.current.beruehrt = false; pause.current.bis = performance.now() + PAUSE_NACH_EINGRIFF_MS }}
            className={cn(
              'flex items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              // Snap nur im manuellen Modus: im Lauf würde er gegen jeden Frame ankämpfen.
              !laeuft && 'snap-x snap-mandatory',
            )}
          >
            {(laeuft ? [1, 2] : [1]).flatMap(kopie => hinweise.map(h => {
              const auf = h.key === aktiv?.key
              const zweite = kopie === 2
              return (
                <li key={`${kopie}-${h.key}`} data-k={kopie} aria-hidden={zweite || undefined} className="shrink-0 snap-start">
                  <button
                    type="button"
                    data-chip
                    tabIndex={zweite ? -1 : undefined}
                    aria-expanded={zweite ? undefined : auf}
                    aria-controls={auf && !zweite ? kartenId : undefined}
                    onClick={ev => umschalten(h.key, ev.currentTarget)}
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
            }))}
          </ul>

          {/* Dezente Fades; sie fangen keine Klicks ab. */}
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity',
              kannLinks || laeuft ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity',
              kannRechts || laeuft ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        {/* Pfeile nur am Desktop; mobil wischt man. */}
        <div className="hidden shrink-0 items-center md:flex">
          <button
            type="button"
            onClick={() => blaettern(-1)}
            disabled={!kannLinks && !laeuft}
            aria-label="Hinweise nach links blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => blaettern(1)}
            disabled={!kannRechts && !laeuft}
            aria-label="Hinweise nach rechts blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {aktiv && kartePos && (
        <div
          id={kartenId}
          role="group"
          aria-label={aktiv.titel}
          style={{ left: kartePos.left, width: kartePos.breite }}
          className="absolute top-full z-30 mt-2 rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <span
            aria-hidden
            style={{ left: kartePos.pfeil - 6 }}
            className="absolute -top-1.5 size-3 rotate-45 border-l border-t border-border bg-card"
          />
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
