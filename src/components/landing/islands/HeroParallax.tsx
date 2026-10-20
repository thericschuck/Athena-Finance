'use client'

import { useEffect } from 'react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { gsap } from '@/components/landing/islands/gsap-setup'

// Insel für den Hero-Parallax. Rendert nichts, sondern greift per DOM auf
// `.hero` und `.hero-photo-img` zu (beides liegt in der Server-Komponente
// `Hero`) — so muss der Hero selbst kein Client-Code sein.

export function HeroParallax() {
  const stillMotion = useReducedMotion()

  /*
   * Parallax auf dem Hero-Aquarell: das Bild hinkt beim Scrollen hinter der
   * eigentlichen Scrollgeschwindigkeit her (y bewegt sich langsamer als der
   * Rest der Seite). Dadurch wirkt es, als schöbe sich die weiße Sektion
   * darunter beim Runterscrollen sichtbar ÜBER das Bild, statt nur normal
   * daran vorbeizuscrollen.
   *
   * yPercent statt fester Pixel: bewegt sich relativ zur eigenen (durch
   * scale(1.24) vergrößerten) Bildhöhe, damit die Stärke auf jeder
   * Viewport-Höhe gleich bleibt — der zugehörige Kanten-Puffer in
   * landing.css ist ebenfalls relativ (scale), beide bleiben so im
   * gleichen Verhältnis zueinander, egal wie hoch der Hero tatsächlich ist.
   *
   * Bewegt wird NUR das Bild selbst, nicht sein Fenster (.hero-photo bleibt
   * unbewegt, siehe dessen scale(1.24)-Kommentar in landing.css) — sonst
   * legte die Verschiebung an einer Kante des Hero eine leere Fläche frei.
   */
  useEffect(() => {
    if (stillMotion) return
    const img = document.querySelector<HTMLImageElement>('.hero-photo-img')
    const hero = img?.closest<HTMLElement>('.hero')
    if (!hero || !img) return

    const tween = gsap.to(img, {
      yPercent: 10,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    })

    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [stillMotion])

  return null
}
