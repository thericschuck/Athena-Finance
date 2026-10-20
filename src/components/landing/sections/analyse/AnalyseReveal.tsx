'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, F, SPACE } from '@/components/landing/landing-tokens'
import { scrollToY } from '@/components/landing/scroll-control'
import { gsap, ScrollTrigger } from '@/components/landing/islands/gsap-setup'
import { Reveal } from '@/components/landing/islands/Reveal'
import { AnalyseCandles } from './AnalyseCandles'
import { AnalyseDeck } from './AnalyseDeck'
import {
  ANALYSE_ITEMS,
  ANALYSE_LEAD_WORDS,
  ANALYSE_MIN_WIDTH,
  ANALYSE_SCENE_VH,
  ANALYSE_SCROLL_VH,
  ANALYSE_STEP_VH,
  type AnalyseCard,
} from '@/components/landing/shared/analyse-config'

/**
 * „Die Analyse" als gepinnte Schritt-Erzählung ab ANALYSE_MIN_WIDTH: die
 * Sektion bleibt stehen, während nacheinander 01–04 hervorgehoben werden und
 * die dunkle Karte zur jeweils passenden Visualisierung wechselt. Erst danach
 * scrollt die Seite weiter.
 *
 * Dieselbe Halte-Technik wie PillarsReveal/PedimentReveal: zusätzliche
 * Scrollstrecke an der Sektion plus ein `position: sticky`-Kind statt GSAP-
 * `pin` (erspart dessen Pin-Spacer-DOM).
 *
 * Anders als beim Säulen-Karussell geht der Schritt-Index bewusst DOCH über
 * React-State: er ändert sich nur viermal über die ganze Szene (nicht pro
 * Frame), und die Karten sind eigene Komponenten — imperatives DOM-Schreiben
 * brächte hier nichts. Der fortlaufende Teil (die Wörter des Einleitungs-
 * satzes) läuft dagegen wie gewohnt direkt über GSAP.
 */
export function AnalyseReveal({ cards, head }: { cards: AnalyseCard[]; head: ReactNode }) {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const leadRef = useRef<HTMLParagraphElement>(null)
  const [step, setStep] = useState(-1)
  const stepRef = useRef(-1)
  // Nur für das mobile Swipe-Karussell (siehe .analyse-deck unter 1024px in
  // landing.css) — Container- und Karten-Refs für IntersectionObserver plus
  // Scroll-zu-Karte per Listenklick (siehe jumpToStep unten).
  const deckContainerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    const lead = leadRef.current
    if (!scene || !lead) return

    const mm = gsap.matchMedia()
    mm.add(`(min-width: ${ANALYSE_MIN_WIDTH}px)`, () => {
      /*
       * Einleitungssatz: die Wörter hellen beim Heranscrollen nacheinander
       * auf und dunkeln beim Zurückscrollen wieder ab (scrub). Der Startwert
       * wird hier per JS gesetzt, NICHT im Markup — sonst stünde der Satz
       * unterhalb von ANALYSE_MIN_WIDTH und bei reduzierter Bewegung, wo
       * diese Timeline nie läuft, dauerhaft ausgegraut da.
       *
       * Der Aufhell-Lauf sitzt bewusst in der hinteren Hälfte des Fensters:
       * die erste Hälfte vergeht, während der Satz noch unter der Falz nach
       * oben wandert — dort wäre die Animation schlicht nicht zu sehen.
       */
      const words = gsap.utils.toArray<HTMLElement>('.analyse-word', lead)
      gsap.set(words, { opacity: 0.24 })
      const introTl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top bottom', end: 'top top', scrub: true },
      })
      words.forEach((w, i) => {
        introTl.to(w, { opacity: 1, duration: 0.1, ease: 'none' }, 0.45 + (i / words.length) * 0.5)
      })

      const applyStep = (next: number) => {
        if (next === stepRef.current) return
        stepRef.current = next
        setStep(next)
      }
      const pin = ScrollTrigger.create({
        trigger: scene,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const scrolled = self.progress * ANALYSE_SCROLL_VH
          applyStep(Math.min(ANALYSE_ITEMS.length - 1, Math.floor(scrolled / ANALYSE_STEP_VH)))
        },
        // Oberhalb der Szene zurück zur Übersichtskarte — ohne das bliebe
        // beim Hochscrollen der zuletzt erreichte Schritt hervorgehoben.
        onLeaveBack: () => applyStep(-1),
      })

      return () => {
        introTl.scrollTrigger?.kill()
        introTl.kill()
        pin.kill()
        gsap.set(words, { clearProps: 'opacity' })
        applyStep(-1)
      }
    })

    return () => mm.revert()
  }, [still])

  /*
   * Mobiles Swipe-Karussell (siehe .analyse-deck unter 1024px in
   * landing.css): ohne die gepinnte Vertikal-Erzählung übernimmt ein
   * IntersectionObserver, welche Karte gerade zentriert im sichtbaren
   * Ausschnitt des horizontalen Containers steht, und schreibt das in
   * `step` — dieselbe Variable, die am Desktop GSAP treibt. Die Liste links
   * hebt den passenden Punkt dadurch genauso hervor wie dort, ganz ohne
   * eigene Styling-Logik nur für den mobilen Fall.
   *
   * Eigener Effekt statt im GSAP-Effekt oben: unabhängig von `still`, weil
   * reines Scroll-Beobachten keine Bewegungs-Animation ist, die
   * `prefers-reduced-motion` einschränken müsste — nur die Kartenreihe selbst
   * bleibt dort per CSS die einfache Liste (siehe landing.css), kein
   * Karussell, das man beobachten müsste.
   */
  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add(`(max-width: ${ANALYSE_MIN_WIDTH - 1}px)`, () => {
      const container = deckContainerRef.current
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
          if (best && best.ratio > 0.6) setStep(best.i)
        },
        { root: container, threshold: [0.6, 0.75, 0.9, 1] },
      )
      cardRefs.current.forEach((el) => el && observer.observe(el))

      return () => observer.disconnect()
    })

    return () => mm.revert()
  }, [])

  /**
   * Springt zu der Scrollposition, an der Schritt `i` vorn steht — gezielt in
   * dessen Mitte, damit man nicht auf der Kante zum nächsten landet.
   *
   * Unterhalb ANALYSE_MIN_WIDTH läuft statt der gepinnten Vertikal-Erzählung
   * das horizontale Swipe-Karussell (siehe oben) — ein Sprung auf der SEITE
   * ergäbe dort keinen Sinn, stattdessen scrollt dieser Zweig das Karussell
   * selbst zur passenden Karte. Erkennung explizit über `matchMedia`, NICHT
   * über `scene.offsetHeight <= window.innerHeight`: Text plus Liste plus
   * Karussell sind zusammen oft schon allein höher als ein Handy-Viewport,
   * `.analyse-scene` bleibt dort trotzdem auf `height: auto` (siehe
   * landing.css) — die Höhen-Heuristik lieferte in genau diesem Fall ein
   * falsches Positiv und hielt die Szene fälschlich für gepinnt.
   */
  /**
   * Schiebt Karte `i` in die Mitte des Swipe-Decks — nur horizontal, im
   * eigenen Scroll-Container.
   *
   * Bewusst kein `scrollIntoView`: das scrollt JEDEN scrollbaren Vorfahren
   * mit, das Dokument eingeschlossen, sobald das Ziel nicht ohnehin schon
   * vollständig im Bild steht (`block: 'nearest'` verhindert das nur im
   * Sonderfall). Ein Listenklick riss dadurch die Seite vertikal mit — und
   * ein nativer Dokument-Scroll arbeitet zusätzlich gegen Lenis' virtuellen
   * Scrollstand (siehe scroll-control.ts). Dieselbe Falle steckte im
   * Extras-Karussell, wo sie über die Automatik sogar von selbst zuschlug.
   *
   * offsetLeft ist unabhängig vom Scrollstand, weil `.analyse-deck`
   * positioniert ist (siehe landing.css).
   */
  const scrollDeckTo = (i: number) => {
    const container = deckContainerRef.current
    const card = cardRefs.current[i]
    if (!container || !card) return
    container.scrollTo({
      left: card.offsetLeft - (container.clientWidth - card.clientWidth) / 2,
      behavior: still ? 'auto' : 'smooth',
    })
  }

  const jumpToStep = (i: number) => {
    const scene = sceneRef.current
    if (!scene) return
    if (window.matchMedia(`(max-width: ${ANALYSE_MIN_WIDTH - 1}px)`).matches) {
      scrollDeckTo(i)
      return
    }
    const scrollDistance = scene.offsetHeight - window.innerHeight
    if (scrollDistance <= 0) {
      /*
       * Die Szene passt komplett in den Viewport — es gibt keine
       * Scrollstrecke, an der sich ein Schritt festmachen ließe. Bleibt nur,
       * die Sektion überhaupt ins Bild zu holen, und auch das über Lenis
       * statt über scrollIntoView. Nur wenn sie nicht ohnehin schon oben
       * steht: sonst ruckelt jeder Listenklick die Seite grundlos zurecht.
       */
      const top = scene.getBoundingClientRect().top
      if (top < 0 || top > window.innerHeight * 0.4) scrollToY(top + window.scrollY)
      return
    }
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY
    const targetVh = (i + 0.5) * ANALYSE_STEP_VH
    scrollToY(sceneTop + (targetVh / ANALYSE_SCROLL_VH) * scrollDistance)
  }

  return (
    <section
      ref={sceneRef}
      data-section-marker="III"
      className="analyse-scene"
      style={{
        ['--analyse-scene-h' as string]: `${ANALYSE_SCENE_VH}vh`,
        padding: `${SPACE.section} ${SPACE.gutter}`,
        position: 'relative',
      }}
    >
      <div className="analyse-sticky">
        <AnalyseCandles />
        <div
          className="g-split"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(40px, 6vw, 80px)',
            alignItems: 'center',
          }}
        >
          <Reveal className="analyse-copy">
            {head}
            <p
              ref={leadRef}
              style={{
                fontFamily: F.serif,
                fontSize: '16px',
                lineHeight: 1.85,
                color: C.inkBody,
                margin: '22px 0 28px',
              }}
            >
              {ANALYSE_LEAD_WORDS.map((w, i) => (
                // Bewusst KEIN inline-block: als reine Inline-Spans brechen
                // die Wörter ganz normal um; ein Transform wird hier ohnehin
                // nicht animiert, nur die Deckkraft.
                <span key={i} className="analyse-word">
                  {w}{' '}
                </span>
              ))}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${C.ruleSoft}` }}>
              {ANALYSE_ITEMS.map((item, i) => {
                const active = step === i
                // step === −1: Übersicht bzw. Fallback ohne gepinnte Szene —
                // dort ist kein Punkt „dran", also alle gleich present.
                const neutral = step === -1
                return (
                  <li
                    key={item}
                    style={{
                      position: 'relative',
                      borderBottom: `1px solid ${C.ruleSoft}`,
                      opacity: neutral || active ? 1 : 0.34,
                      transition: 'opacity .4s ease',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: '-16px',
                        top: '50%',
                        width: '3px',
                        height: active ? '56%' : '0%',
                        backgroundColor: C.goldInk,
                        transform: 'translateY(-50%)',
                        transition: 'height .4s ease',
                      }}
                    />
                    {/* Jeder Punkt ist anklickbar und springt an die Stelle,
                        an der er vorn steht — dieselbe Idee wie beim
                        Säulen-Karussell (siehe jumpToPillar): „hinspringen"
                        heißt schlicht, dorthin zu scrollen, wo dieser Schritt
                        aktiv wäre. */}
                    <button
                      type="button"
                      className="analyse-step-btn"
                      onClick={() => jumpToStep(i)}
                      style={{ display: 'flex', gap: '16px', alignItems: 'baseline', width: '100%', padding: '14px 0' }}
                    >
                      <span
                        style={{
                          fontFamily: F.mono,
                          fontSize: '11px',
                          color: active ? C.goldInkDeep : C.goldInk,
                          flexShrink: 0,
                          transition: 'color .4s ease',
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        style={{
                          fontFamily: F.serif,
                          fontSize: '14px',
                          lineHeight: 1.7,
                          textAlign: 'left',
                          color: active ? C.ink : C.inkBody,
                          transition: 'color .4s ease',
                        }}
                      >
                        {item}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="split-card">
            <AnalyseDeck
              cards={cards}
              active={step}
              onSelect={jumpToStep}
              registerContainerRef={(el) => { deckContainerRef.current = el }}
              registerCardRef={(i, el) => { cardRefs.current[i] = el }}
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
