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

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    lenisRef.current = lenis
    setActiveLenis(lenis)

    /*
     * `html { scroll-behavior: smooth }` (siehe globals.css) ist ein
     * sitebreiter Default fürs Dashboard (native Anker-Sprünge). Lenis
     * übernimmt den Scroll hier komplett selbst — bleibt die native
     * Glättung nebenher aktiv, greift der Browser bei JEDER programmatischen
     * Scroll-Positionsänderung (auch Lenis' eigenen internen Schreibvorgängen
     * auf scrollTop) zusätzlich mit seiner eigenen Animation ein, die mit
     * Lenis' virtuellem Scroll um denselben Frame konkurriert — das
     * "kämpfende" Doppel-Smoothing ist ein bekannter Lenis-Stolperstein
     * (siehe Lenis-Docs: „remove scroll-behavior: smooth"). Die Klasse
     * schaltet es NUR für die Dauer der Landing-Page-Montage ab (siehe
     * html.lenis-active in globals.css), das Dashboard behält sein Default.
     */
    document.documentElement.classList.add('lenis-active')

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
    const refresh = () => ScrollTrigger.refresh()
    document.fonts?.ready?.then(refresh).catch(() => {})
    window.addEventListener('load', refresh)

    return () => {
      window.removeEventListener('load', refresh)
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisRef.current = null
      clearActiveLenis(lenis)
      document.documentElement.classList.remove('lenis-active')
    }
  }, [])

  return <>{children}</>
}
