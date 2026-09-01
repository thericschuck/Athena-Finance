'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Abstand, den das schwebende Element zu dem hält, dem es ausweicht. */
const GAP_PX = 12

/**
 * Mehr wird nicht angehoben. Eine Begrenzung ist nötig, weil ein hohes Ziel (eine ganze
 * Fußzeile) den Knopf sonst in die Bildmitte schieben würde — dort stört er mehr als unten.
 */
const MAX_LIFT_PX = 240

/**
 * Verschiebt ein fest positioniertes Element (unten rechts) nach oben, solange darunter
 * etwas liegt, das anklickbar bleiben muss.
 *
 * Anlass: Athenas schwebender Knopf sitzt auf `bottom-5 right-5` mit `z-40` und lag damit
 * genau über den rechten Knöpfen der Blätterleiste — „Weiter" und „Letzte Seite" waren
 * nicht erreichbar, der Klick landete auf dem Knopf darüber. Ein höherer z-index an der
 * Leiste hätte das Problem nur umgedreht: dann wäre Athena verdeckt.
 *
 * Gemessen wird gegen die BASIS-Position (aktuelles Rechteck plus bereits angewandte
 * Anhebung), nicht gegen die verschobene: sonst hebt sich das Element aus der Überlappung,
 * misst „passt wieder", fällt zurück — und flackert im Kreis.
 *
 * Ziele markieren sich selbst über ein Attribut, statt hier aufgezählt zu werden. So weiß
 * die Blätterleiste, dass sie freigehalten werden will, und dieser Hook muss keine Seite
 * der App kennen.
 */
export function useAvoidOverlap<T extends HTMLElement>(selector: string) {
  const ref = useRef<T>(null)
  const [lift, setLift] = useState(0)
  // Der angewandte Wert auch als Ref: `messen` läuft aus Event-Handlern und darf nicht bei
  // jeder Anhebung neu erzeugt werden, sonst hängen die Listener am alten Stand.
  const liftRef = useRef(0)

  const messen = useCallback(() => {
    const el = ref.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const basisUnterkante = rect.bottom + liftRef.current

    let benoetigt = 0
    for (const ziel of document.querySelectorAll<HTMLElement>(selector)) {
      const r = ziel.getBoundingClientRect()
      // Ausgeblendete Ziele (display:none) haben ein Nullrechteck und liegen rechnerisch
      // oben links — ohne diese Zeile würde ihnen ausgewichen.
      if (r.width === 0 && r.height === 0) continue
      // Waagerecht: die Anhebung verschiebt nur senkrecht, `rect` stimmt hier also.
      const ueberlapptX = r.right > rect.left - GAP_PX && r.left < rect.right + GAP_PX
      if (!ueberlapptX) continue
      benoetigt = Math.max(benoetigt, basisUnterkante - (r.top - GAP_PX))
    }

    const naechster = Math.max(0, Math.min(benoetigt, MAX_LIFT_PX))
    // Subpixel-Zappeln nicht in den State schreiben.
    if (Math.abs(naechster - liftRef.current) < 1) return
    liftRef.current = naechster
    setLift(naechster)
  }, [selector])

  useEffect(() => {
    let frame = 0
    const planen = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(messen)
    }

    planen()

    // `capture: true`, weil im Dashboard nicht das Fenster scrollt, sondern ein Container
    // innerhalb der Seite (siehe app-shell: `h-dvh overflow-hidden`). Ein Listener am
    // Fenster ohne Capture bekäme davon nichts mit.
    window.addEventListener('scroll', planen, true)
    window.addEventListener('resize', planen)

    // Und aus demselben Grund reicht ein ResizeObserver auf `body` nicht: dessen Höhe
    // ändert sich nie. Wenn die Tabelle nach einem Filterwechsel kürzer wird, sieht man das
    // nur an den Knoten selbst.
    const mo = new MutationObserver(planen)
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', planen, true)
      window.removeEventListener('resize', planen)
      mo.disconnect()
    }
  }, [messen])

  return { ref, lift }
}

/**
 * Attribut, mit dem sich ein Element als „hier bitte freihalten" markiert. Als Konstante,
 * damit Selektor und Markierung nicht auseinanderlaufen können.
 */
export const AVOID_ATTRIBUTE = 'data-athena-avoid'
export const AVOID_SELECTOR = `[${AVOID_ATTRIBUTE}]`
