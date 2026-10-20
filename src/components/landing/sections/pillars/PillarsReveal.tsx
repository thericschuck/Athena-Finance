'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Image from 'next/image'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, F, SPACE } from '@/components/landing/landing-tokens'
import { scrollToY } from '@/components/landing/scroll-control'
import { gsap } from '@/components/landing/islands/gsap-setup'
import { Reveal } from '@/components/landing/islands/Reveal'

/**
 * Die vier Säulen — jede in einer eigenen klassischen Ordnung, von der
 * schlichtesten zur reichsten (toskanisch → dorisch → ionisch → korinthisch).
 * Die Bilddateien liegen in public/ und stammen aus dem Figma-Export.
 */
const PILLARS = [
  {
    num: 'I',
    src: '/column-tuscan.svg',
    w: 102,
    h: 332,
    title: 'Überblick',
    desc: 'Konten, Depots und Verträge stehen in einer Ansicht — kein Wechseln zwischen Portalen.',
  },
  {
    num: 'II',
    src: '/column-doric.svg',
    w: 95,
    h: 330,
    title: 'Präzision',
    desc: 'Jede Zahl stammt aus einer echten Buchung. Keine Schätzung, keine Hochrechnung.',
  },
  {
    num: 'III',
    src: '/column-ionic.svg',
    w: 115,
    h: 332,
    title: 'Regeln',
    desc: 'Wiederkehrendes bucht sich selbst, Strategien folgen definierten Indikatoren.',
  },
  {
    num: 'IV',
    src: '/column-corinthian.svg',
    w: 101,
    h: 330,
    title: 'Historie',
    desc: 'Jede Buchung bleibt erhalten — Vergleiche über Jahre statt Momentaufnahmen.',
  },
]

/** Ab hier läuft die Säulenreihe als scroll-gesteuerte Lichtwanderung (siehe
    PillarsReveal); darunter bleibt die bestehende Grid-/Listen-Darstellung
    unverändert (siehe die .g-pillars-Regeln in landing.css). */
const PILLARS_MIN_WIDTH = 1024
/** Scrollstrecke, während das Licht von einer Säule zur nächsten wandert —
    genug, um Titel und Beschreibung in Ruhe zu lesen. */
const PILLARS_STEP_VH = 46
/**
 * Schlussphase: das Licht weitet sich, bis die ganze Front beleuchtet ist.
 * Darauf läuft die Überschrift „Ein Fundament" hinaus — während der
 * Wanderung steht immer nur eine Säule im Licht, hier stehen zum ersten Mal
 * alle vier zusammen da, mit allen vier Beschreibungen lesbar.
 */
const PILLARS_FLOOD_VH = 44
const PILLARS_TRAVEL_VH = PILLARS_STEP_VH * (PILLARS.length - 1)
const PILLARS_SCENE_VH = 100 + PILLARS_TRAVEL_VH + PILLARS_FLOOD_VH
/**
 * Anteil der 0–1-Fortschrittsachse, den die Wanderung einnimmt; der Rest
 * gehört der Flutphase. Die Achse ist reiner Scroll-Fortschritt, teilt sich
 * also exakt im Verhältnis der beiden Scrollstrecken darüber.
 */
const PILLARS_TRAVEL_P = PILLARS_TRAVEL_VH / (PILLARS_TRAVEL_VH + PILLARS_FLOOD_VH)
/**
 * Radius des Lichtkegels in Spaltenbreiten. Genau 1.0 hieße: die
 * Nachbarsäule liegt exakt auf der Kegelkante und bekommt nichts mehr ab —
 * die Wanderung sähe dann aus wie hartes Umschalten. Etwas darüber lässt der
 * Rand des Kegels die Nachbarn noch streifen.
 */
const PILLARS_BEAM_COLS = 1.15
/**
 * Wie magnetisch die Säulenmitten sind (0 = gar nicht, 1 = das Licht kommt
 * auf jeder Mitte komplett zum Stehen). Bei 0 folgt der Sonnenstand dem
 * Scroll exakt linear — dann bleibt das Licht genauso gut zwischen zwei
 * Säulen stehen wie auf einer, und keine Position fühlt sich wie ein
 * Ruhepunkt an.
 *
 * Stand zuerst auf 0.5 mit einer einfachen smoothstep-Kurve; das war messbar
 * da, aber praktisch unsichtbar. Der Grund lag nicht am Wert, sondern daran,
 * WO die Bremsung wirkt: nahe einer Mitte ist die betroffene Säule ohnehin
 * schon voll beleuchtet und ihre Helligkeit ändert sich kaum noch — langsamer
 * durch eine Zone zu fahren, in der sich nichts tut, sieht nach nichts aus.
 * Sichtbar wird der Magnet erst über den KONTRAST zwischen Ruhe und Wechsel.
 *
 * Ruhedauer und Übergangstempo lassen sich dabei nicht unabhängig einstellen:
 * die Fläche unter der Kurve ist immer 1, also muss ein längerer Halt genau
 * so viel schnelleren Wechsel bezahlen. Eine Zwischenfassung übertrieb das
 * (78 % Ruhe, aber dreifaches Tempo im Wechsel — der wirkte wie ein Sprung).
 *
 * Jetzt der ausgewogene Punkt: 1.0 auf einer einfachen (statt doppelten)
 * smootherstep-Kurve. Das Licht kommt auf jeder Mitte VOLLSTÄNDIG zum Stehen
 * — Tempo exakt 0 statt nur langsam — und ruht auf rund zwei Dritteln der
 * Scrollstrecke, wechselt dazwischen aber nur noch mit knapp doppeltem statt
 * dreifachem Tempo. Der Halt ist dadurch sogar deutlicher als vorher, der
 * Übergang trotzdem spürbar ruhiger.
 */
const PILLARS_MAGNET = 1
/** Deutlich engerer Kegel für den Fließtext: nur die Säule, auf der das
    Licht wirklich steht, trägt ihre Beschreibung (siehe applyLight). */
const PILLARS_TEXT_COLS = 0.62
/** Abstand zwischen zwei Säulen auf der Wanderungs-Achse (4 Säulen an den
    Stellen 0, ⅓, ⅔, 1). */
const PILLARS_PROGRESS_STEP = 1 / (PILLARS.length - 1)

/**
 * „Die Säulen" ab PILLARS_MIN_WIDTH: die Kolonnade steht die ganze Zeit
 * vollständig und unbewegt da — was scrollt, ist der Sonnenstand. Ein
 * Lichtkegel wandert von Säule I nach Säule IV: die beleuchtete Säule wird
 * heller UND wärmer, ihre Stufe hellt mit auf, der Lichtpool an ihrem Fuß
 * richtet sich auf, während die Pools der Nachbarn vom Licht weg kippen.
 * Zum Schluss rückt die Sonne in die Mitte und der Kegel weitet sich, bis
 * die ganze Front im Licht steht (siehe PILLARS_FLOOD_VH).
 *
 * Bewusst KEINE Bewegung der Säulen selbst: eine Vorgängerfassung zog die
 * jeweils vorderste zur Bildschirmmitte und skalierte sie. Dadurch
 * überlappten die Säulen einander — daher der damalige z-index-Fix, die
 * blickdichte Stufenkante und der harte Cutoff der Beschreibung, damit sich
 * nicht zwei Fließtexte lesbar überlagern. Und sie nahm die Tempelfront
 * optisch auseinander, also genau das Gegenteil dessen, was die Überschrift
 * „Ein Fundament" behauptet. Steht die Front still, entfallen alle drei
 * Reparaturen ersatzlos.
 *
 * Dieselbe Halte-Technik wie PedimentReveal: die Sektion bekommt
 * zusätzliche Scrollstrecke, ein `position: sticky`-Kind hält den Ausschnitt
 * fest (kein GSAP-`pin`, das erspart dessen Pin-Spacer-DOM), während JS pro
 * Säule nur zwei Custom Properties setzt statt über React-State zu gehen —
 * bei einem scrub-getriebenen Update pro Scroll-Frame wäre ein Re-Render pro
 * Säule pro Frame spürbar. Die Umrechnung von „wie hell" in Filter-, Alpha-
 * und Opacity-Werte steht in landing.css (siehe --lit dort); das JS liefert
 * nur die Zahl.
 *
 * Unter PILLARS_MIN_WIDTH und bei reduzierter Bewegung bleibt exakt die
 * bisherige Grid-/Listen-Darstellung erhalten (siehe landing.css) — dieselbe
 * Markup-Struktur, CSS entscheidet per Breakpoint, ob sie gepinnt/animiert
 * läuft, GSAP baut die Timeline nur dort, wo die CSS sie auch zeigt.
 */
export function PillarsReveal({ head, frieze }: { head: ReactNode; frieze: ReactNode }) {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const pillarRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    if (!scene) return

    const mm = gsap.matchMedia()
    mm.add(`(min-width: ${PILLARS_MIN_WIDTH}px)`, () => {
      const state = { p: 0 }
      const sticky = stickyRef.current

      /**
       * Smoothstep: 0→0, 1→1, an beiden Enden mit Steigung 0. Die weiche
       * Schulter des Lichtkegels — ohne sie liefe dessen Kante als sichtbar
       * harte Linie über die Säulen — und zugleich die Rampe der Flutphase.
       */
      const smooth = (t: number) => {
        const x = Math.min(1, Math.max(0, t))
        return x * x * (3 - 2 * x)
      }

      /**
       * Kurve der magnetischen Mitten: smootherstep (6t⁵−15t⁴+10t³).
       *
       * Bewusst NICHT dasselbe wie `smooth` oben. Smoothstep ist nur exakt an
       * den Enden flach und steigt gleich danach wieder an — die Ruhezone um
       * eine Säulenmitte wäre damit so schmal, dass man sie nicht bemerkt.
       * Smootherstep hat an den Enden auch die ZWEITE Ableitung null und
       * bleibt dadurch spürbar länger flach, ohne dass der Übergang zwischen
       * zwei Säulen dafür steil werden muss.
       *
       * Eine Vorfassung verkettete diese Funktion mit sich selbst. Das
       * verbreiterte die Ruhezone weiter, machte den Wechsel aber dreimal so
       * schnell wie ein linearer Durchlauf — die Fläche unter der Kurve ist
       * fest, längerer Halt wird immer mit schnellerem Wechsel bezahlt. Als
       * Bewegung sah das aus wie ein Sprung, nicht wie wanderndes Licht.
       *
       * Monoton und exakt 0→0, 1→1: beides ist hier Bedingung — die Achse
       * muss dem Scroll in beide Richtungen folgen und die Säulenmitten für
       * jumpToPillar exakt treffen.
       */
      const magnetEase = (t: number) => {
        const x = Math.min(1, Math.max(0, t))
        return x * x * x * (x * (x * 6 - 15) + 10)
      }

      /*
       * Gerechnet wird in Spalten-Koordinaten (Säule I = 0 … Säule IV = 3),
       * nicht in Pixeln: dadurch gibt es nichts zu messen. Ein
       * offsetWidth-Zugriff in onUpdate einer scrub-Timeline erzwingt sonst
       * pro Frame ein Re-Layout (dasselbe Prinzip wie der gecachte
       * Zylinder-Radius in PedimentReveal), und der Sonnenstand lässt sich
       * am Ende direkt als Prozentwert an die CSS weiterreichen.
       */
      const applyLight = () => {
        const last = PILLARS.length - 1
        // Wanderung und anschließende Flut teilen sich die Fortschrittsachse
        // im selben Verhältnis wie ihre Scrollstrecken (PILLARS_TRAVEL_P).
        const travel = Math.min(1, state.p / PILLARS_TRAVEL_P)
        const flood = smooth((state.p - PILLARS_TRAVEL_P) / (1 - PILLARS_TRAVEL_P))
        /*
         * Magnetische Mitten: der lineare Fortschritt `raw` wird INNERHALB
         * jedes Säulenabstands verbogen, statt die Sonne stur mit dem Scroll
         * mitlaufen zu lassen. magnetEase ist an beiden Enden flach —
         * angewendet auf den Bruchteil zwischen zwei Säulen heißt das: nahe
         * einer Mitte steht das Licht still, dazwischen zieht es hinüber.
         * Jede Mitte ist dadurch ein echter Ruhepunkt statt eine von beliebig
         * vielen gleichwertigen Positionen — ohne dass der Wechsel dazwischen
         * in einen Sprung kippt (siehe PILLARS_MAGNET).
         *
         * Bewusst eine Verzerrung der Achse und kein eigener Snap-Tween: die
         * Achse bleibt monoton und stetig, folgt dem Scroll also weiter 1:1
         * und läuft beim Zurückscrollen exakt rückwärts. Ein nachlaufender
         * Tween müsste gegen das Scrubbing anarbeiten und würde beim
         * Richtungswechsel sichtbar zucken.
         *
         * `idx` auf last-1 gedeckelt, damit am oberen Rand (raw === last)
         * nicht f = 0 im nicht existierenden Abschnitt dahinter landet.
         */
        const raw = travel * last
        const idx = Math.min(last - 1, Math.floor(raw))
        const f = raw - idx
        const sunTravel = raw + PILLARS_MAGNET * (magnetEase(f) - f)
        // In der Flutphase rückt die Sonne aus der äußersten Position zurück
        // in die Mitte der Front, damit das Licht am Ende gleichmäßig fällt
        // statt von ganz rechts.
        const sun = sunTravel + (last / 2 - sunTravel) * flood
        const beamCols = PILLARS_BEAM_COLS + flood * 1.6

        pillarRefs.current.forEach((el, i) => {
          if (!el) return
          const dist = Math.abs(i - sun)
          // Math.max gegen `flood`, statt den Kegel allein breit genug zu
          // machen: er müsste sonst absurd weit werden, damit auch die
          // äußerste Säule am Ende wirklich bei 1 ankommt.
          const lit = Math.max(1 - smooth(dist / beamCols), flood)
          /*
           * Kipprichtung des Lichtpools am Säulenfuß: das Licht kommt von
           * `sun`, eine Säule rechts davon wirft ihren Pool nach rechts. Auf
           * −1…1 begrenzt, sonst kippt die äußerste Säule bei ganz linkem
           * Sonnenstand unnatürlich weit weg.
           */
          const cast = Math.max(-1, Math.min(1, (i - sun) / 1.8))
          el.style.setProperty('--lit', lit.toFixed(3))
          el.style.setProperty('--cast', cast.toFixed(3))

          /*
           * Der Fließtext hängt an einem viel engeren Kegel als die Säule
           * selbst — sonst stünden beim Vorbeiwandern kurz zwei
           * Beschreibungen halb sichtbar nebeneinander. In der Flutphase
           * werden dagegen absichtlich ALLE vier lesbar: das ist der Moment,
           * in dem die Sektion ihr Versprechen einlöst.
           *
           * .pillar-copy ist das letzte Kind von .pillar-inner, der
           * Beschreibungstext wiederum dessen letztes Kind (siehe JSX) —
           * lastElementChild statt einer erneuten Suche pro Frame.
           */
          const copy = el.lastElementChild as HTMLElement | null
          const desc = copy?.lastElementChild as HTMLElement | null
          if (desc) desc.style.opacity = Math.max(1 - smooth(dist / PILLARS_TEXT_COLS), flood).toFixed(3)
        })

        if (sticky) {
          /*
           * Sonnenstand als Prozentwert über die Reihe: die Mitte von Säule i
           * liegt bei (i + ½) / Anzahl. Lichtschleier und Gebälk lesen ihn
           * (siehe .pillars-light / .entablature::after in landing.css) —
           * dasselbe Licht, das die Säulen trifft, wandert über den Architrav.
           *
           * Beide Werte landen in der CSS in einem `transform`, nicht in der
           * Gradient-Definition selbst. Als Gradient-Position formuliert
           * musste der Browser den bildschirmhohen Verlauf bei JEDEM
           * Scroll-Frame neu zeichnen; als Transform verschiebt er nur eine
           * einmal gerasterte Ebene. Das war der teuerste Posten der ganzen
           * Szene.
           */
          sticky.style.setProperty('--pillars-sun-x', `${(((sun + 0.5) / PILLARS.length) * 100).toFixed(2)}%`)
          sticky.style.setProperty('--pillars-beam-scale', (1 + flood * 3.7).toFixed(3))
        }
      }
      applyLight()

      gsap
        .timeline({
          scrollTrigger: {
            trigger: scene,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
            onRefresh: applyLight,
          },
        })
        .to(state, { p: 1, ease: 'none', onUpdate: applyLight })

      /*
       * mm.revert() setzt nur zurück, was GSAP selbst angefasst hat — die
       * Custom Properties oben sind direkt gesetzt und blieben sonst am
       * Element kleben, wenn das Fenster unter PILLARS_MIN_WIDTH schrumpft:
       * die statische Listendarstellung stünde dann mit dem Lichtstand von
       * eben da, inklusive einer unsichtbar gebliebenen Beschreibung.
       */
      return () => {
        pillarRefs.current.forEach((el) => {
          if (!el) return
          el.style.removeProperty('--lit')
          el.style.removeProperty('--cast')
          const copy = el.lastElementChild as HTMLElement | null
          const desc = copy?.lastElementChild as HTMLElement | null
          if (desc) desc.style.removeProperty('opacity')
        })
        sticky?.style.removeProperty('--pillars-sun-x')
        sticky?.style.removeProperty('--pillars-beam-scale')
      }
    })

    return () => mm.revert()
  }, [still])

  /**
   * Klick auf eine (auch unbeleuchtete) Säule springt zu ihrem Moment: der
   * Sonnenstand ist reiner Scroll-Fortschritt (state.p, siehe oben),
   * „hinspringen" heißt also schlicht dorthin scrollen, wo das Licht auf
   * Säule i stünde — kein zweiter Animationsmechanismus nötig. Der Faktor
   * PILLARS_TRAVEL_P, weil die Wanderung nur den vorderen Teil der Szene
   * einnimmt; dahinter liegt noch die Flutphase.
   *
   * `scrollDistance <= 0` erkennt zuverlässig, ob die Lichtwanderung
   * überhaupt aktiv ist: unter PILLARS_MIN_WIDTH und bei reduzierter
   * Bewegung bleibt .pillars-scene per CSS auf `height: auto` (siehe
   * landing.css), dann ist sie nie größer als der Viewport — genau dann
   * ergibt ein Sprung ohnehin keinen Sinn, weil nichts gepinnt ist.
   */
  const jumpToPillar = (i: number) => {
    const scene = sceneRef.current
    if (!scene) return
    const scrollDistance = scene.offsetHeight - window.innerHeight
    if (scrollDistance <= 0) return
    const sceneTop = scene.getBoundingClientRect().top + window.scrollY
    scrollToY(sceneTop + i * PILLARS_PROGRESS_STEP * PILLARS_TRAVEL_P * scrollDistance)
  }

  return (
    <section style={{ backgroundColor: C.onyx, padding: `${SPACE.section} ${SPACE.gutter}` }}>
      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        <div data-section-marker="II">
          <Reveal>
            {head}
          </Reveal>
        </div>

        <div
          ref={sceneRef}
          className="pillars-scene"
          style={{ ['--pillars-scene-h' as string]: `${PILLARS_SCENE_VH}vh` }}
        >
          <div ref={stickyRef} className="pillars-sticky">
            {/*
              Der Lichtschleier — der weiche Kegel selbst, den man zwischen
              den Säulen hindurchfallen sieht. Steht bewusst VOR dem Gebälk
              im DOM und liegt hinter der Säulenreihe (siehe z-index bei
              .g-pillars in landing.css): Licht fällt zwischen die Säulen,
              nicht über sie. Position und Breite kommen aus den Custom
              Properties, die applyLight auf .pillars-sticky setzt.
            */}
            <span className="pillars-light" aria-hidden>
              <span className="pillars-light-beam" />
            </span>
            {/*
              Gebälk: bewusst INNERHALB der gepinnten Fläche statt davor —
              bliebe es ein normaler Reveal vor der Szene, wäre es schon
              weggescrollt, sobald das Pinning greift. So bleibt es die ganze
              Szene über oben stehen, während das Licht darunter von Säule zu
              Säule wandert (dasselbe Tempelfront-Bild wie zuvor, nur ohne
              die künstliche Lücke).
            */}
            <Reveal y={16} style={{ marginTop: 'clamp(44px, 6vw, 76px)', flexShrink: 0 }}>
              <div className="entablature">
                {frieze}
                <span className="architrave" />
              </div>
            </Reveal>

            <div
              className="g-pillars"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {PILLARS.map((p, i) => (
                <Reveal key={p.src} delay={0.08 + i * 0.1} y={20} className="pillar">
                  {/*
                    Eigene Ebene für die eigentliche Anordnung UND für die
                    Vordergrund-Betonung: Reveal legt intern einen unbewegten
                    Sentinel-Wrapper um ein animiertes <motion.div>, Schaft
                    und Text sind dadurch Enkel von .pillar, keine direkten
                    Kinder mehr — .pillar-inner trägt deshalb sowohl das
                    Flex-Layout als auch (ab PILLARS_MIN_WIDTH) das
                    scroll-gesteuerte transform/opacity/filter von oben.

                    Klickbar/fokussierbar, damit auch eine zurückliegende
                    Säule direkt angesprungen werden kann (siehe
                    jumpToPillar) — unterhalb PILLARS_MIN_WIDTH und bei
                    reduzierter Bewegung ist das Karussell gar nicht aktiv,
                    dort no-opt jumpToPillar über den scrollDistance-Check
                    ohnehin still.
                  */}
                  <span
                    ref={(el) => {
                      pillarRefs.current[i] = el
                    }}
                    className="pillar-inner"
                    role="button"
                    tabIndex={0}
                    aria-label={`Zu „${p.title}" springen`}
                    onClick={() => jumpToPillar(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        jumpToPillar(i)
                      }
                    }}
                  >
                    <span className="pillar-shaft">
                      {/*
                        Dieselbe Zeichnung zweimal: unten die unbeleuchtete
                        Fassung, darüber die beleuchtete, deren Deckkraft am
                        Lichtstand hängt (siehe --lit in landing.css).

                        Sieht nach Umweg aus, ist aber der Grund, warum die
                        Szene flüssig läuft. Vorher trug EIN Bild einen
                        Filter, dessen Werte pro Scroll-Frame neu gesetzt
                        wurden — `filter` hat keinen Compositor-Pfad, der
                        Browser musste die Säule (ein SVG mit rund 880 Pfaden,
                        bis zu 360px hoch) also in jedem Frame neu rastern,
                        viermal nebeneinander. Zwei Ebenen mit je einem festen
                        Filter werden dagegen einmal gerastert; pro Frame
                        ändert sich nur noch die Deckkraft der oberen, und das
                        macht der Compositor.

                        Zwei <Image> auf dieselbe Datei sind eine Anfrage: der
                        Browser holt die URL einmal.
                      */}
                      <span className="pillar-img-stack">
                        <Image
                          src={p.src}
                          alt=""
                          aria-hidden
                          width={p.w}
                          height={p.h}
                          unoptimized
                          className="pillar-img pillar-img-cold"
                        />
                        <Image
                          src={p.src}
                          alt=""
                          aria-hidden
                          width={p.w}
                          height={p.h}
                          unoptimized
                          className="pillar-img pillar-img-warm"
                        />
                      </span>
                    </span>
                    <span className="pillar-copy">
                      <span
                        style={{
                          display: 'block',
                          fontFamily: F.display,
                          fontSize: '15px',
                          letterSpacing: '0.14em',
                          color: C.gold,
                          marginBottom: '10px',
                        }}
                      >
                        {p.num}
                      </span>
                      <h3
                        style={{
                          fontFamily: F.display,
                          fontSize: 'clamp(19px, 2vw, 23px)',
                          fontWeight: 500,
                          color: C.onCream,
                          margin: '0 0 10px',
                        }}
                      >
                        {p.title}
                      </h3>
                      <span
                        className="af-balance"
                        style={{
                          display: 'block',
                          fontFamily: F.serif,
                          fontSize: '14px',
                          lineHeight: 1.75,
                          color: C.onBody,
                        }}
                      >
                        {p.desc}
                      </span>
                    </span>
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
