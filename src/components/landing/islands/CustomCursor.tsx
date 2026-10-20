'use client'

import { useEffect, useRef } from 'react'

/**
 * Individueller Cursor für die Landing Page: eine feine Gold-Kontur mit
 * kurzem Nachlauf plus ein präziser Punkt exakt auf der Zeigerposition —
 * derselbe Goldton wie Kicker/Divider (`--af-gold-ink`), nur als Interaktion
 * statt als Ornament. Wächst über Links/Buttons zu einem größeren, sanft
 * gefüllten Ring auf (siehe HOVER_SELECTOR) und zieht sich beim Klicken
 * kurz zusammen — dieselbe „schwere", gedämpfte Bewegungssprache wie der
 * Rest der Seite (vgl. die Easing-Kurven in Reveal/PedimentReveal), hier nur
 * an die Maus statt an Scroll gekoppelt.
 *
 * Zwei Elemente statt eines: der Punkt folgt der Maus 1:1 (Präzision), der
 * Ring per Lerp mit Verzögerung (der eigentliche "Luxus"-Effekt). Beide
 * Positionen laufen über direkt gesetzte `transform`-Inline-Styles in einer
 * `requestAnimationFrame`-Schleife statt über React-State — ein Re-Render
 * pro Mausbewegung/Frame wäre unnötig teuer und exakt die Art Animation, die
 * man ohnehin nicht durch Reacts Reconciler schleusen will.
 *
 * Rendert IMMER dieselbe Markup-Struktur (kein SSR/Client-Zweig, vgl. den
 * Hydration-Hinweis in `@/lib/use-reduced-motion`) — Sichtbarkeit und „nur mit echter Maus"
 * laufen rein über die Media Query `(hover: hover) and (pointer: fine)` in
 * landing.css, kein Hydration-Risiko.
 */
export function CustomCursor() {
  const rootRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Nur mit echter Maus aufwendig genug, um sich zu lohnen — auf Touch-
    // Geräten gäbe es ohnehin nichts zu verfolgen (kein hover, kein hover-
    // Zeiger). Dieselbe Bedingung wie die Sichtbarkeits-Media-Query in CSS.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const root = rootRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    if (!root || !ring || !dot) return

    const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let ringX = mouseX
    let ringY = mouseY
    let active = false
    let raf = 0

    const ringTransform = () =>
      `translate(${ringX}px, ${ringY}px) translate(-50%, -50%) scale(${active ? 0.82 : 1})`

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`
      root.classList.add('is-visible')
      // Reduzierte Bewegung: Ring folgt sofort statt über die Lerp-Schleife
      // unten — kein separater rAF-Loop nötig, es gibt dann nichts zu tweenen.
      if (stillMotion) {
        ringX = mouseX
        ringY = mouseY
        ring.style.transform = ringTransform()
      }
    }
    const onLeave = () => root.classList.remove('is-visible')

    // Nachlauf des Rings: läuft dem Punkt in jedem Frame ein Stück näher —
    // 0.16 ist bewusst kein Vorschlag, sondern erprobt: merklich weicher als
    // 1:1, aber schnell genug, um nicht "hinterherzuhinken" zu wirken.
    const tick = () => {
      ringX += (mouseX - ringX) * 0.16
      ringY += (mouseY - ringY) * 0.16
      ring.style.transform = ringTransform()
      raf = requestAnimationFrame(tick)
    }

    const HOVER_SELECTOR = 'a, button, [role="button"], input, select, textarea, summary'
    const onOver = (e: PointerEvent) => {
      if ((e.target as Element)?.closest?.(HOVER_SELECTOR)) {
        ring.classList.add('is-hover')
        dot.classList.add('is-hidden')
      }
    }
    const onOut = (e: PointerEvent) => {
      if ((e.target as Element)?.closest?.(HOVER_SELECTOR)) {
        ring.classList.remove('is-hover')
        dot.classList.remove('is-hidden')
      }
    }
    const onDown = () => { active = true }
    const onUp = () => { active = false }

    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    if (!stillMotion) raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={rootRef} className="af-cursor" aria-hidden>
      <div ref={ringRef} className="af-cursor-ring" />
      <div ref={dotRef} className="af-cursor-dot" />
    </div>
  )
}
