'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import type { KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { dismissInsight } from '@/app/(dashboard)/dashboard/insight-actions'
import { useMarquee } from '@/lib/hooks/use-marquee'
import type { DashboardKern } from '@/lib/dashboard/typen'
import { cn } from '@/lib/utils'

/**
 * Athenas Hinweise als EINE schmale Zeile (44 px): links „Athena (n)", rechts eine durchlaufende Reihe
 * kompakter Chips (Ton-Punkt + einzeiliger Titel). Der volle Text steht in einer Detailkarte, die als
 * Popover ÜBER dem Inhalt liegt (absolute) und die Seite deshalb nie verlängert oder springen lässt.
 *
 * Die Karte öffnet sich an der AKTUELLEN Position des angeklickten Chips: beim Öffnen wird seine Lage
 * relativ zum Container gemessen, `left` ist die Chip-Kante, geklemmt auf den Container (auf dem Handy
 * heißt das: volle Zeilenbreite). Der Lauf pausiert, solange die Karte offen ist; Escape, Klick
 * daneben oder erneuter Klick auf den Chip schließen.
 *
 * Weggeklickte Hinweise werden nicht gelöscht, sondern nur mit `dismissed_at` markiert (siehe
 * insight-actions.ts): im System-Log bleibt nachvollziehbar, was Athena wann bemerkt hat. Die Lauf-Logik
 * steckt im Hook lib/hooks/use-marquee.ts.
 */

const KARTE_MAX_PX = 416 // 26rem

const TON = {
  info: { farbe: 'bg-sky-500', label: 'Zur Info' },
  warning: { farbe: 'bg-amber-500', label: 'Achtung' },
  critical: { farbe: 'bg-red-500', label: 'Kritisch' },
} as const

/** Woher ein Hinweis stammt; Typen ohne Eintrag (Chat-Hinweise) bekommen keine Marke. */
const HERKUNFT: Record<string, string> = { athena_review: 'Wochenlauf', reminder: 'Erinnerung' }

const tonVon = (severity: string) => TON[severity as keyof typeof TON] ?? TON.info

export function DashHinweise({ insights }: { insights: DashboardKern['insights'] }) {
  const router = useRouter()
  const [ausgeblendet, setAusgeblendet] = useState<ReadonlySet<string>>(new Set())
  const [offen, setOffen] = useState<{ id: string; left: number; breite: number } | null>(null)
  const [, startTransition] = useTransition()
  const wurzel = useRef<HTMLDivElement>(null)
  const kartenId = useId()

  // Stabile Referenz: `useMarquee` startet bei jeder neuen Array-Instanz seine Messung neu.
  const hinweise = useMemo(() => insights.filter(i => !ausgeblendet.has(i.id)), [insights, ausgeblendet])
  const reihe = useRef<HTMLUListElement>(null)
  const m = useMarquee(reihe, hinweise, offen !== null)
  const aktiv = hinweise.find(h => h.id === offen?.id) ?? null

  // Escape und Klick daneben schließen die Detailkarte.
  useEffect(() => {
    if (!offen) return
    const taste = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') setOffen(null) }
    const daneben = (ev: PointerEvent) => {
      if (wurzel.current && !wurzel.current.contains(ev.target as Node)) setOffen(null)
    }
    document.addEventListener('keydown', taste)
    document.addEventListener('pointerdown', daneben)
    return () => {
      document.removeEventListener('keydown', taste)
      document.removeEventListener('pointerdown', daneben)
    }
  }, [offen])

  function oeffnen(id: string, chip: HTMLElement) {
    if (offen?.id === id) { setOffen(null); return }
    const w = wurzel.current
    if (!w) return
    const wr = w.getBoundingClientRect()
    const cr = chip.getBoundingClientRect()
    const breite = Math.min(KARTE_MAX_PX, wr.width)
    setOffen({ id, breite, left: Math.max(0, Math.min(cr.left - wr.left, wr.width - breite)) })
  }

  function erledigt(id: string) {
    // Sofort ausblenden, Serverzustand danach — ein Klick auf „erledigt" soll nicht auf einen Roundtrip warten.
    setAusgeblendet(prev => new Set(prev).add(id))
    setOffen(null)
    startTransition(async () => {
      await dismissInsight(id)
      router.refresh()
    })
  }

  function pfeiltaste(ev: KeyboardEvent<HTMLUListElement>) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
    const chips = [...(reihe.current?.querySelectorAll<HTMLButtonElement>('li[data-k="1"] button') ?? [])]
    const i = chips.findIndex(c => c === document.activeElement)
    if (i < 0) return
    ev.preventDefault()
    chips[Math.min(chips.length - 1, Math.max(0, i + (ev.key === 'ArrowRight' ? 1 : -1)))]?.focus()
  }

  if (hinweise.length === 0) {
    return (
      <div className="flex h-11 items-center gap-2 text-sm text-muted-foreground/70" role="region" aria-label="Athena">
        <Check className="size-4" aria-hidden />
        Keine offenen Hinweise
      </div>
    )
  }

  const { laeuft } = m
  return (
    <div ref={wurzel} className="relative min-w-0" role="region" aria-label="Athena">
      <div className="flex h-11 items-center gap-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          Athena <span className="tabular-nums">({hinweise.length})</span>
        </span>

        <div className="relative min-w-0 flex-1 overflow-hidden" {...m.huelleProps}>
          <ul
            ref={reihe}
            {...m.reiheProps}
            onKeyDown={pfeiltaste}
            className={cn(
              'flex items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              // Snap nur im manuellen Modus: im Lauf würde er gegen jeden Frame ankämpfen.
              !laeuft && 'snap-x snap-mandatory',
            )}
          >
            {(laeuft ? [1, 2] : [1]).flatMap(kopie => hinweise.map(h => {
              const auf = h.id === aktiv?.id
              const zweite = kopie === 2
              const ton = tonVon(h.severity)
              return (
                <li key={`${kopie}-${h.id}`} data-k={kopie} aria-hidden={zweite || undefined} className="shrink-0 snap-start">
                  <button
                    type="button"
                    tabIndex={zweite ? -1 : undefined}
                    aria-expanded={zweite ? undefined : auf}
                    aria-controls={auf && !zweite ? kartenId : undefined}
                    onClick={ev => oeffnen(h.id, ev.currentTarget)}
                    className={cn(
                      'inline-flex h-10 max-w-[24rem] items-center gap-2 rounded-full border border-border bg-card px-3 text-xs',
                      'transition-colors hover:bg-muted/50 active:bg-muted',
                      auf && 'bg-muted',
                    )}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', ton.farbe)} aria-hidden />
                    <span className="sr-only">{ton.label}: </span>
                    <span className="truncate">{h.title}</span>
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
              m.kannLinks || laeuft ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity',
              m.kannRechts || laeuft ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        {/* Pfeile nur am Desktop; mobil wischt man. */}
        <div className="hidden shrink-0 items-center md:flex">
          <button
            type="button"
            onClick={() => m.blaettern(-1)}
            disabled={!m.kannLinks && !laeuft}
            aria-label="Hinweise nach links blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => m.blaettern(1)}
            disabled={!m.kannRechts && !laeuft}
            aria-label="Hinweise nach rechts blättern"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {aktiv && offen && (
        <div
          id={kartenId}
          role="group"
          aria-label={aktiv.title}
          className="absolute top-full z-30 mt-1 rounded-lg border border-border bg-card p-3 shadow-lg"
          style={{ left: offen.left, width: offen.breite }}
        >
          <p className="flex items-start gap-2 text-sm font-medium leading-snug">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', tonVon(aktiv.severity).farbe)} aria-hidden />
            <span className="min-w-0">
              {aktiv.title}
              {HERKUNFT[aktiv.type] && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-normal text-muted-foreground">
                  {HERKUNFT[aktiv.type]}
                </span>
              )}
            </span>
          </p>
          {aktiv.body && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{aktiv.body}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link
              // Der Hinweis geht mit: die Chat-Seite lädt ihn und legt einen fertigen Prompt ins Eingabefeld.
              href={`/assistant?hinweis=${aktiv.id}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-1 text-xs font-medium hover:underline"
            >
              Im Chat
              <ArrowRight className="size-3" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => erledigt(aktiv.id)}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted/50"
            >
              <Check className="size-3" aria-hidden />
              Erledigt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
