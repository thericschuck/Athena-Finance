'use client'

import { useEffect, useRef, useState } from 'react'
import { m, useInView } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { EASE } from '@/components/landing/shared/motion'

/**
 * Nur für `Reveal`s mit `once=false` gebraucht: hält fortlaufend fest, ob
 * zuletzt nach oben oder unten gescrollt wurde. Ein reiner Vorzeichenvergleich
 * in einem `ref` statt einem State-Update — läuft potenziell bei jedem
 * Scroll-Event, ein Re-Render pro Event wäre unnötig teuer, und kein anderer
 * Teil der Komponente muss auf eine Richtungsänderung selbst reagieren
 * (der `ref`-Wert wird nur im NÄCHSTEN Render, ausgelöst durch `useInView`,
 * mitgelesen). `enabled=false` (der Normalfall — die meisten Reveals nutzen
 * `once=true` und brauchen das hier nie) hängt gar keinen Listener ein.
 */
function useScrollDirection(enabled: boolean) {
  const dir = useRef<'up' | 'down'>('down')
  useEffect(() => {
    if (!enabled) return
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y !== lastY) dir.current = y > lastY ? 'down' : 'up'
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])
  return dir
}

/**
 * Fade-up (oder seitlich, siehe `x`) beim Scrollen ins Bild. Löst standardmäßig
 * (`once=true`) einmalig aus und bleibt danach dauerhaft sichtbar — kein
 * Zurückanimieren beim Hochscrollen (bei der kleinen Standard-Fade-up-Bewegung
 * wirkte ein Exit-Effekt in einer früheren Fassung unruhig, per Nutzerfeedback
 * wieder entfernt).
 *
 * `once={false}` (siehe Instrumentarium-Karten) ist RICHTUNGSABHÄNGIG, nicht
 * einfach die Umkehr derselben Bewegung in beide Scrollrichtungen: verlässt
 * die Karte den Viewport, während man WEITERSCROLLT (vorwärts, in derselben
 * Richtung, aus der sie kam), bleibt sie einfach stehen — man lässt sie
 * hinter sich, kein Grund, sie wegzuanimieren. Erst beim ZURÜCKSCROLLEN (man
 * bewegt sich von einer bereits gezeigten Karte weg, sie verlässt den
 * Viewport auf der GEGENÜBERLIEGENDEN Kante) fährt sie sichtbar wieder aus
 * dem Bild — als Rückspulen der Enthüllung, nicht als deren Wiederholung.
 * Ohne diese Unterscheidung „kopiert" der Effekt beim Hochscrollen einfach
 * die Herein-Animation des Runterscrollens, was sich falsch anfühlt: eine
 * Karte, die man gerade erst (vorwärts) verlassen hat, sollte nicht
 * rückwärts wieder einfliegen, nur weil man kurz weiterscrollt.
 *
 * Zwei verschachtelte Elemente statt nur einem `motion.div` mit `whileInView`:
 * `whileInView` beobachtet das Element an seiner TATSÄCHLICHEN, bereits
 * transformierten Position. Bei großem `x` (siehe Instrumentarium-Karten,
 * `x: '-100vw'`) sitzt die Karte anfangs eine volle Fensterbreite neben dem
 * Viewport — und weil `.af-landing` bewusst `overflow-x: clip` trägt (verhindert
 * horizontales Scrollen durch andere dekorative Elemente), schneidet dieser
 * Vorfahre die Karte dort clientseitig ab. IntersectionObserver behandelt
 * geclipte Fläche als nicht schneidend, unabhängig von `viewport.margin` — die
 * Karte hätte dadurch NIE ausgelöst, egal wie weit man scrollt.
 *
 * Der äußere `<div ref>` bleibt deshalb unverändert in der normalen
 * Layout-Position (trägt `className`/`style`, u. a. die Grid-Platzierung) und
 * wird per `useInView` beobachtet; der innere `motion.div` übernimmt Versatz
 * und Fade und bekommt den Sichtbarkeits-Status nur als fertigen Boolean.
 */
export function Reveal({
  children,
  delay = 0,
  x = 0,
  y = 26,
  once = true,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  /**
   * Zahl = Pixel-Versatz (Standardfall, kleine Fade-Bewegung). Für ein
   * Einfliegen von außerhalb des Bildschirms (siehe Instrumentarium-Karten)
   * einen `vw`-String übergeben, z. B. `'-100vw'` — px-Werte reichen dafür
   * nicht, weil die Karten in einem zentrierten, schmaleren Container sitzen
   * und ein fester Pixelbetrag je nach Fensterbreite trotzdem sichtbar bliebe.
   */
  x?: number | string
  y?: number
  /**
   * `false` lässt das Element beim Zurückscrollen wieder in seinen `offset`-
   * Zustand zurückfallen (siehe Kommentar oben) statt einmalig auszulösen
   * und dauerhaft sichtbar zu bleiben (Standardfall). Für die meisten
   * Reveals bewusst NICHT gesetzt: ein Exit-Effekt bei der kleinen
   * Fade-up-Bewegung wirkte in einer früheren Fassung unruhig.
   */
  once?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const still = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  /*
   * `amount` nur für once=false auf 0.6 angehoben: mit dem Default (`'some'`,
   * bereits 1px zählt) kippt `inView` erst auf `false`, wenn die Karte
   * VOLLSTÄNDIG unsichtbar ist — die Ausfahr-Animation würde dann komplett
   * außerhalb des Viewports laufen, man sähe sie nie. Bei once=true bleibt
   * der Default: dort zählt nur der EINMALIGE Eintritt, je früher desto
   * besser.
   */
  const inView = useInView(ref, { once, margin: '0px', amount: once ? 'some' : 0.6 })
  const offset = { opacity: 0, x: still ? 0 : x, y: still ? 0 : y }
  const scrollDir = useScrollDirection(!once)
  // Nur für once=false gebraucht: merkt sich, ob die Karte SCHON EINMAL
  // gezeigt wurde — zusammen mit `scrollDir` entscheidet das unten, ob ein
  // Verlassen des Viewports ein normales Vorwärts-Weiterscrollen ist
  // (stehenbleiben) oder ein Zurückscrollen (wieder ausfliegen), siehe
  // Kommentar an der Komponente.
  const hasEnteredRef = useRef(false)
  const [animate, setAnimate] = useState(offset)

  // `scrollDir`/`hasEnteredRef` sind Refs und dürfen nicht direkt im Render
  // gelesen werden (siehe react-hooks/refs) — die Auswertung läuft deshalb
  // in einem Effekt, ausgelöst durch dieselbe `inView`-Änderung, die auch
  // sonst den Übergang triggert. `x`/`y`/`still` statt der daraus gebauten
  // `offset`/`visible`-Objekte in den Deps: Objektliterale sind bei jedem
  // Aufruf neue Referenzen und würden den Effekt bei jedem Render erneut
  // auslösen.
  useEffect(() => {
    const off = { opacity: 0, x: still ? 0 : x, y: still ? 0 : y }
    const vis = { opacity: 1, x: 0, y: 0 }
    if (inView) {
      hasEnteredRef.current = true
      setAnimate(vis)
    } else if (!once && hasEnteredRef.current) {
      setAnimate(scrollDir.current === 'up' ? off : vis)
    } else {
      setAnimate(off)
    }
  }, [inView, once, x, y, still, scrollDir])

  return (
    <div ref={ref} className={className} style={style}>
      <m.div
        style={{ height: '100%' }}
        initial={offset}
        animate={animate}
        transition={{ duration: still ? 0.15 : 0.7, delay: still ? 0 : delay, ease: EASE }}
      >
        {children}
      </m.div>
    </div>
  )
}
