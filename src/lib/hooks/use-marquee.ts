'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

/**
 * Durchlaufende Chip-Zeile (Marquee) als Hook: die Reihe läuft langsam von rechts nach links durch.
 *
 * Technik: requestAnimationFrame auf `scrollLeft` (nicht per transform), damit Wischen mit dem Finger
 * und Scrollen mit den Pfeilen weiter gehen. Die Position wird als Kommazahl selbst geführt, weil
 * Browser `scrollLeft` bei 0,5 px je Frame sonst auf ganze Pixel runden und der Lauf stehen bliebe.
 * Nahtlos wird er durch eine zweite Kopie der Chips: der Aufrufer rendert bei `laeuft` jede Chip-`li`
 * zweimal (`data-k="1"` und `data-k="2"`, die zweite aria-hidden und nicht per Tab erreichbar).
 * Erreicht die Position die Breite der ersten Kopie, springt sie um genau diese zurück.
 *
 * Der Lauf steht still, wenn alles in die Zeile passt, bei prefers-reduced-motion, bei Hover,
 * Tastaturfokus, geöffneter Karte (`pausiert`), Berührung (bis 2 s danach) und im Hintergrund-Tab.
 */

const LAUF_PX_PRO_SEKUNDE = 28
const PAUSE_NACH_EINGRIFF_MS = 2000
/** Abstand zwischen den Chips (`gap-2`); wird für die exakte Schleifenlänge gebraucht. */
const CHIP_ABSTAND = 8

/** Länge der ersten Kopie (ohne Abstand am Ende); größer als die Zeile = es gibt etwas zu laufen. */
function kopieBreiteVon(el: HTMLElement | null): number {
  const chips = el?.querySelectorAll<HTMLElement>('li[data-k="1"]')
  if (!chips || chips.length === 0) return 0
  return chips[chips.length - 1].getBoundingClientRect().right - chips[0].getBoundingClientRect().left
}

const REDUZIERT = '(prefers-reduced-motion: reduce)'
function abonniereReduziert(cb: () => void) {
  const mq = window.matchMedia(REDUZIERT)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const reduziertJetzt = () => window.matchMedia(REDUZIERT).matches

/** `reihe` ist die Ref der scrollbaren `ul`; der Aufrufer legt sie an (so bleibt die Ref nicht im Rückgabeobjekt). */
export function useMarquee(reihe: RefObject<HTMLElement | null>, abhaengigVon: unknown, pausiert: boolean) {
  const [kannLinks, setKannLinks] = useState(false)
  const [kannRechts, setKannRechts] = useState(false)
  // Serverseitig (und bis zur Hydration) reduziert: erst im Browser startet der Lauf.
  const reduziert = useSyncExternalStore(abonniereReduziert, reduziertJetzt, () => true)
  const [breit, setBreit] = useState(false)
  const laeuft = !reduziert && breit
  const pause = useRef({ hover: false, fokus: false, karte: false, beruehrt: false, bis: 0 })

  useEffect(() => {
    const messen = () => {
      const el = reihe.current
      if (!el) return
      setKannLinks(el.scrollLeft > 4)
      setKannRechts(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
      setBreit(kopieBreiteVon(reihe.current) > el.clientWidth + 1)
    }
    messen()
    const el = reihe.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(messen)
    ro.observe(el)
    return () => ro.disconnect()
  }, [reihe, abhaengigVon])

  useEffect(() => {
    pause.current.karte = pausiert
  }, [pausiert])

  useEffect(() => {
    const el = reihe.current
    if (!laeuft || !el) return
    let pos = el.scrollLeft
    let letzte: number | null = null
    let warPause = false
    let frame = 0
    const schritt = (t: number) => {
      frame = requestAnimationFrame(schritt)
      const p = pause.current
      const steht = p.hover || p.fokus || p.karte || p.beruehrt || t < p.bis || document.hidden
      if (steht) {
        warPause = true
        letzte = null
        return
      }
      if (warPause) {
        pos = el.scrollLeft // Nutzer hat evtl. gescrollt: dort weiterlaufen
        warPause = false
      }
      const dt = letzte === null ? 0 : Math.min(t - letzte, 100)
      letzte = t
      const laenge = kopieBreiteVon(reihe.current) + CHIP_ABSTAND
      pos += (LAUF_PX_PRO_SEKUNDE * dt) / 1000
      if (pos >= laenge) pos -= laenge
      el.scrollLeft = pos
    }
    frame = requestAnimationFrame(schritt)
    return () => cancelAnimationFrame(frame)
  }, [reihe, laeuft, abhaengigVon])

  const eingriff = () => { pause.current.bis = performance.now() + PAUSE_NACH_EINGRIFF_MS }

  /** Eine Seite blättern; im Lauf ist links nie zu Ende, daher eine Kopie nach rechts rücken (unsichtbar). */
  function blaettern(richtung: -1 | 1) {
    const el = reihe.current
    if (!el) return
    eingriff()
    if (laeuft && richtung === -1 && el.scrollLeft < el.clientWidth) el.scrollBy({ left: kopieBreiteVon(reihe.current) + CHIP_ABSTAND, behavior: 'instant' })
    el.scrollBy({ left: richtung * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  return {
    laeuft, kannLinks, kannRechts, blaettern,
    /** Auf die `ul`. */
    reiheProps: {
      onScroll: (ev: React.UIEvent<HTMLElement>) => {
        const el = ev.currentTarget
        setKannLinks(el.scrollLeft > 4)
        setKannRechts(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
      },
      onFocus: () => { pause.current.fokus = true },
      onBlur: () => { pause.current.fokus = false },
      onTouchStart: () => { pause.current.beruehrt = true },
      onTouchEnd: () => { pause.current.beruehrt = false; eingriff() },
      onTouchCancel: () => { pause.current.beruehrt = false; eingriff() },
    },
    /** Auf den Container um die `ul` (Hover nur mit der Maus). */
    huelleProps: {
      onPointerEnter: (ev: React.PointerEvent) => { if (ev.pointerType === 'mouse') pause.current.hover = true },
      onPointerLeave: () => { pause.current.hover = false },
    },
  }
}
