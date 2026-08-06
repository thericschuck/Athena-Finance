'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

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
    }
  }, [])

  return <>{children}</>
}
