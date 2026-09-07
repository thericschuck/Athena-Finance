'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { setActiveLenis, clearActiveLenis } from './scroll-control'

gsap.registerPlugin(ScrollTrigger)

/**
 * Treibt Lenis' Damped-Scroll und bindet ScrollTrigger daran — nur für die
 * Landing Page gemountet (siehe LandingClient), nicht global im Root-Layout:
 * das Dashboard hat eigene scrollbare Panels/Tabellen, denen ein
 * abgekoppelter virtueller Scroll nicht zuträglich wäre.
 *
 * Ohne diese Kopplung driftet ScrollTrigger innerhalb von Sekunden vom
 * tatsächlich sichtbaren Scrollstand ab, weil Lenis den nativen Scroll durch
 * einen eigenen virtuellen ersetzt, den ScrollTrigger sonst nicht sieht.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return // nativer Scroll bleibt unangetastet

    /*
     * Reihenfolge der nächsten drei Schritte ist hier zwingend, nicht
     * Geschmack — sie ist der Grund, warum man auf einer frisch geöffneten
     * Seite überhaupt oben landet.
     *
     * (1) Die Klasse schaltet `html { scroll-behavior: smooth }` ab (siehe
     *     unten und globals.css). Sie muss VOR dem Scrollen stehen, sonst
     *     wird aus dem Sprung nach oben eine Animation, die noch läuft,
     *     während Lenis schon seinen Startwert einliest.
     *
     * (2) Dokument auf 0. Lenis liest den Scrollstand beim Erzeugen EINMAL
     *     ein und rechnet ab da mit seinem eigenen, virtuellen Stand weiter.
     *     Steht das Dokument in diesem Moment noch irgendwo in der Mitte,
     *     friert Lenis genau das ein — man landet auf der neuen Seite nicht
     *     oben, sondern mittendrin. Das passiert in zwei Fällen: beim Wechsel
     *     von einer langen auf eine kurze Seite (Landing Page → /interesse:
     *     der Browser kappt die alte Position auf die neue Dokumenthöhe) und
     *     beim Neuladen, wenn der Browser die letzte Position wiederherstellt.
     *
     * (3) Erst dann Lenis erzeugen — es startet damit garantiert bei 0.
     *
     * Mit Anker im URL-Fragment bleibt die Position unangetastet, sonst
     * spränge ein geteilter Link wie /#warteliste ebenfalls nach oben.
     */
    document.documentElement.classList.add('lenis-active')

    /*
     * Die Wiederherstellung der alten Position greift beim Neuladen NACH
     * diesem Effekt und würde den Sprung oben sofort wieder überschreiben —
     * deshalb hier abschalten und beim Verlassen zurückstellen, damit alle
     * anderen Seiten (Dashboard) ihr normales Verhalten behalten.
     *
     * Für eine scroll-erzählte Seite ist das ohnehin die bessere Vorgabe:
     * ScrollTrigger vermisst seine Szenen beim Initialisieren, und eine
     * wiederhergestellte Position mitten in einer gepinnten Szene ist genau
     * die Situation, in der diese Messung danebenliegt.
     */
    const previousRestoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const startAtTop = !window.location.hash
    if (startAtTop) window.scrollTo(0, 0)

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    lenisRef.current = lenis
    setActiveLenis(lenis)

    /*
     * Noch einmal auf 0, jetzt über Lenis selbst: `window.scrollTo` oben setzt
     * nur das Dokument. Lenis führt daneben einen eigenen, virtuellen Stand
     * (`animatedScroll`/`targetScroll`), den es beim Erzeugen aus dem Dokument
     * ableitet — bleibt dabei ein Rest stehen, zieht der nächste RAF-Tick die
     * Seite wieder dorthin. Erst diese Zeile setzt beide Stände gleich.
     */
    if (startAtTop) lenis.scrollTo(0, { immediate: true, force: true })

    /*
     * Ab der ersten echten Nutzereingabe darf niemand mehr an der Position
     * drehen. Bewusst an wheel/touch/keydown gehängt und nicht an das
     * scroll-Ereignis: das feuert auch bei Lenis' eigenen Schreibvorgängen,
     * der Merker stünde also sofort auf „hat gescrollt", bevor überhaupt
     * jemand etwas getan hat.
     */
    let userMoved = false
    const markMoved = () => { userMoved = true }
    window.addEventListener('wheel', markMoved, { passive: true, once: true })
    window.addEventListener('touchstart', markMoved, { passive: true, once: true })
    window.addEventListener('keydown', markMoved, { once: true })

    /*
     * Zur Klasse oben: `html { scroll-behavior: smooth }` ist ein sitebreiter
     * Default fürs Dashboard (native Anker-Sprünge). Lenis übernimmt den
     * Scroll hier komplett selbst — bliebe die native Glättung nebenher
     * aktiv, griffe der Browser bei JEDER programmatischen Positionsänderung
     * (auch Lenis' eigenen Schreibvorgängen auf scrollTop) zusätzlich mit
     * seiner eigenen Animation ein und konkurrierte mit Lenis um denselben
     * Frame. Dieses „kämpfende" Doppel-Smoothing ist ein bekannter
     * Lenis-Stolperstein (siehe Lenis-Docs: „remove scroll-behavior:
     * smooth"). Die Klasse gilt NUR für die Montagedauer dieses Providers,
     * das Dashboard behält seinen Default.
     */

    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    /*
     * ScrollTrigger misst Start/Ende seiner Trigger einmalig beim Erstellen.
     * Die Hero-Headline (Playfair Display, Serif-Fließtext in Lora) lädt als
     * Webfont NACH dem ersten Layout nach und kann den Zeilenumbruch — damit
     * die Hero-Höhe — noch verschieben, nachdem PedimentReveal seinen
     * ScrollTrigger schon angelegt hat. Ohne Refresh bleibt die gecachte
     * Messung dann leicht daneben: Zierfüllung/Giebel setzen minimal zu früh
     * oder zu spät ein, was wie ein Positionierungsfehler aussieht, aber ein
     * Sync-Fehler ist (siehe scroll-storytelling-Skill, Pitfalls-Checkliste).
     */
    const refresh = () => {
      ScrollTrigger.refresh()
      /*
       * Und danach die Position noch einmal festnageln.
       *
       * `ScrollTrigger.refresh()` merkt sich vor dem Neuvermessen den
       * Scrollstand und stellt ihn danach wieder her. Mit Lenis dazwischen ist
       * „danach" aber nicht zuverlässig derselbe Wert wie „davor" — die
       * Wiederherstellung schreibt in das Dokument, während Lenis' virtueller
       * Stand unverändert bleibt, und der nächste Tick gewinnt. Weil der
       * Refresh erst läuft, wenn die Webfonts geladen sind (also deutlich nach
       * dem Mount), landete die Seite dadurch reproduzierbar ein Stück
       * unterhalb des Anfangs statt ganz oben.
       *
       * Nur solange niemand selbst gescrollt hat: wer schon liest, soll nicht
       * zurückgerissen werden, bloß weil eine Schrift nachgeladen hat.
       */
      if (startAtTop && !userMoved) lenis.scrollTo(0, { immediate: true, force: true })
    }
    document.fonts?.ready?.then(refresh).catch(() => {})
    window.addEventListener('load', refresh)

    return () => {
      window.removeEventListener('load', refresh)
      window.removeEventListener('wheel', markMoved)
      window.removeEventListener('touchstart', markMoved)
      window.removeEventListener('keydown', markMoved)
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisRef.current = null
      clearActiveLenis(lenis)
      history.scrollRestoration = previousRestoration
      document.documentElement.classList.remove('lenis-active')
    }
  }, [])

  return <>{children}</>
}
