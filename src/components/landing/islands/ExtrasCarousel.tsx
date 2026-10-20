'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, F } from '@/components/landing/landing-tokens'

export type ExtrasItem = { icon: ReactNode; title: string; desc: string }

/** Zeit zwischen zwei automatischen Weiterschaltungen (siehe ExtrasCarousel). */
const EXTRAS_AUTOPLAY_MS = 4500
/** Pause nach einer manuellen Interaktion (Pfeil/Punkt/Wisch), bevor die
    Automatik wieder übernimmt — verhindert, dass der Autoplay direkt über
    eine gerade erst selbst gewählte Karte hinwegläuft. */
const EXTRAS_RESUME_MS = 6000

/**
 * Horizontales Karussell für „Weitere Eigenschaften" auf sehr schmalen
 * Displays (siehe .extras-carousel unter 420px in landing.css — darüber
 * bleibt das bestehende Karten-Raster unverändert, siehe .g-extras). Anders
 * als die Analyse-Sektion braucht es hier keine gepinnte Vertikal-Erzählung:
 * die vier Punkte sind reine Zusatzinfos, kein Inhalt, dessen vollständiges
 * Sehen erzwungen werden müsste — Klicken/Wischen UND ein sanfter Autoplay
 * genügen (siehe Chat: „horizontal zum Durchklicken … aber so, dass sie von
 * alleine auch durchwechseln").
 *
 * Autoplay pausiert bei jeder manuellen Interaktion (Pfeil, Punkt, Wisch) für
 * EXTRAS_RESUME_MS und respektiert `prefers-reduced-motion` (kein Autoplay,
 * Klicken/Wischen bleibt aber voll funktionsfähig) — automatisch weiterlaufende
 * Inhalte ohne Pause-Möglichkeit sind ein bekanntes A11y-Problem (WCAG 2.2.2).
 */
export function ExtrasCarousel({ items }: { items: ExtrasItem[] }) {
  const still = useReducedMotion()
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const deckRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /* Läuft die Automatik gerade ins Leere? Siehe den Effekt weiter unten. */
  const inViewRef = useRef(false)

  /**
   * Schiebt Karte `i` in die Mitte des Decks — ausschließlich über den
   * eigenen horizontalen Scrollstand des Decks.
   *
   * Vorher stand hier `scrollIntoView({ inline: 'center', block: 'nearest' })`,
   * und das war ein handfester Fehler: `block: 'nearest'` verzichtet nur dann
   * auf vertikales Scrollen, wenn das Element ohnehin schon vollständig im
   * Bild steht. Steht es das nicht — und beim Seitenaufruf steht dieses
   * Karussell ganz unten auf der Seite —, dann scrollt der Browser JEDEN
   * scrollbaren Vorfahren mit, das Dokument eingeschlossen. Die Automatik
   * riss die Seite also 4,5 Sekunden nach dem Laden von selbst bis nach unten
   * zu „Weitere Eigenschaften". Nur auf schmalen Displays sichtbar, weil das
   * Karussell erst unter 420px überhaupt eine Box hat (siehe
   * .extras-carousel) — darüber ist es `display: none` und scrollIntoView ein
   * No-op.
   *
   * Dazu kam, dass ein nativer Dokument-Scroll gegen Lenis' virtuellen
   * Scrollstand arbeitet (siehe scroll-control.ts) — das Scrollen fühlte
   * sich danach auch dort kaputt an, wo man wieder hingescrollt hatte.
   *
   * `container.scrollTo` fasst dagegen nur die eigene Scrollbox an. offsetLeft
   * ist unabhängig vom aktuellen Scrollstand, solange das Deck selbst
   * positioniert ist (siehe `position: relative` in landing.css).
   */
  const scrollToIndex = (i: number) => {
    const container = deckRef.current
    const card = cardRefs.current[i]
    if (!container || !card) return
    const left = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2
    container.scrollTo({ left, behavior: still ? 'auto' : 'smooth' })
  }

  const stopAutoplay = () => {
    if (autoplayRef.current) clearInterval(autoplayRef.current)
    autoplayRef.current = null
  }
  const startAutoplay = () => {
    if (still) return
    stopAutoplay()
    autoplayRef.current = setInterval(() => {
      // Weiterschalten nur im Bild: sonst hat der Nutzer beim Zurückkommen
      // eine Karte vor sich, die er nie gewählt hat — und auf allen Breiten
      // über 420px, wo das Karussell gar nicht sichtbar ist (siehe
      // .extras-carousel), liefe die Automatik ohnehin ins Leere.
      if (!inViewRef.current) return
      scrollToIndex((activeRef.current + 1) % items.length)
    }, EXTRAS_AUTOPLAY_MS)
  }
  // Nach eigenem Klick/Wisch: Automatik kurz aussetzen statt sofort wieder
  // querzuschalten, dann wie gewohnt fortsetzen.
  const onManualInteract = () => {
    stopAutoplay()
    if (resumeRef.current) clearTimeout(resumeRef.current)
    resumeRef.current = setTimeout(startAutoplay, EXTRAS_RESUME_MS)
  }

  // Welche Karte gerade zentriert im Bild steht — dieselbe Technik wie beim
  // Analyse-Karussell (siehe AnalyseReveal): treibt sowohl die Punkte-Anzeige
  // als auch, über `activeRef`, das Ziel des nächsten Autoplay-Schritts.
  useEffect(() => {
    const container = deckRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const candidates = entries
          .map((entry) => ({ i: cardRefs.current.findIndex((el) => el === entry.target), ratio: entry.intersectionRatio }))
          .filter((c) => c.i !== -1)
        const best = candidates.reduce<{ i: number; ratio: number } | null>(
          (acc, c) => (!acc || c.ratio > acc.ratio ? c : acc),
          null,
        )
        if (best && best.ratio > 0.6) {
          activeRef.current = best.i
          setActive(best.i)
        }
      },
      { root: container, threshold: [0.6, 0.75, 0.9, 1] },
    )
    cardRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  /*
   * Sichtbarkeit des Karussells selbst — steuert `inViewRef` oben. Bewusst
   * ein zweiter Observer neben dem für die aktive Karte: der beobachtet die
   * Karten INNERHALB des Decks (root = Deck), dieser hier das Deck im
   * Viewport. Ein `display: none`-Element gilt dabei nie als sichtbar, damit
   * deckt derselbe Mechanismus auch gleich alle Breiten über 420px mit ab.
   */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    startAutoplay()
    return () => {
      stopAutoplay()
      if (resumeRef.current) clearTimeout(resumeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still])

  return (
    <div className="extras-carousel" ref={rootRef}>
      <div className="extras-carousel-deck" ref={deckRef} onPointerDown={onManualInteract}>
        {items.map((f, i) => (
          <div key={f.title} className="extras-carousel-card" ref={(el) => { cardRefs.current[i] = el }}>
            <span style={{ color: C.oliveDeep }}>{f.icon}</span>
            <div style={{ height: '1px', backgroundColor: C.rule }} />
            <h3 style={{ fontFamily: F.display, fontSize: '17px', fontWeight: 500, color: C.ink, margin: 0 }}>
              {f.title}
            </h3>
            <p style={{ fontFamily: F.serif, fontSize: '13px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="extras-carousel-controls">
        <button
          type="button"
          className="extras-carousel-arrow"
          aria-label="Vorherige Eigenschaft"
          onClick={() => { onManualInteract(); scrollToIndex((activeRef.current - 1 + items.length) % items.length) }}
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
        </button>
        <div className="extras-carousel-dots" role="tablist" aria-label="Eigenschaft wählen">
          {items.map((f, i) => (
            <button
              key={f.title}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Zu „${f.title}" springen`}
              className={`extras-carousel-dot${active === i ? ' active' : ''}`}
              onClick={() => { onManualInteract(); scrollToIndex(i) }}
            />
          ))}
        </div>
        <button
          type="button"
          className="extras-carousel-arrow"
          aria-label="Nächste Eigenschaft"
          onClick={() => { onManualInteract(); scrollToIndex((activeRef.current + 1) % items.length) }}
        >
          <ChevronRight size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
