'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Erklaerungskarte fuer eine Zelle der schmalen Kennzahlen-Leiste (AnalyseKennzahlen.tsx).
 *
 * Warum nicht `HoverInfo` (rein CSS): die Leiste ist waagerecht scrollbar (`overflow-x-auto`), und
 * ein solcher Container schneidet absolut positionierte Kinder ab. Die Karte wird deshalb in den
 * `document.body` gerendert (Portal) und mit `position: fixed` an die Zelle gesetzt, am Rand des
 * Bildschirms eingeklemmt, damit sie auf 360 px nicht herausragt. Ein Portal statt `fixed` im Baum,
 * weil ein Vorfahr mit `transform` (Seiten-Animation) `fixed` sonst an sich selbst binden wuerde.
 *
 * Oeffnet bei Hover, Fokus und Tippen (die Zelle ist fokussierbar); schliesst bei Verlassen,
 * Fokusverlust, Scrollen und Escape.
 */

const BREITE = 256
const RAND = 8

export function AnalyseKennzahlInfo({
  titel, zeilen = [], text, children, className,
}: {
  titel: string
  zeilen?: readonly (readonly [string, string])[]
  text: string
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const oeffnen = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const breite = Math.min(BREITE, window.innerWidth - 2 * RAND)
    setPos({
      left: Math.max(RAND, Math.min(r.left, window.innerWidth - breite - RAND)),
      top: r.bottom + 6,
    })
  }, [])
  const schliessen = useCallback(() => setPos(null), [])

  useEffect(() => {
    if (!pos) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    window.addEventListener('scroll', schliessen, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('scroll', schliessen, true)
      window.removeEventListener('keydown', esc)
    }
  }, [pos, schliessen])

  return (
    <div
      ref={ref}
      tabIndex={0}
      className={className}
      onMouseEnter={oeffnen}
      onMouseLeave={schliessen}
      // Nur Tastaturfokus oeffnet: ein Tipp fokussiert das Element ebenfalls, und der folgende Klick
      // schlisse die Karte sofort wieder.
      onFocus={e => { if (e.currentTarget.matches(':focus-visible')) oeffnen() }}
      onBlur={schliessen}
      onClick={() => (pos ? schliessen() : oeffnen())}
    >
      {children}
      {pos && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-lg border border-border bg-popover p-3 text-xs text-foreground shadow-lg"
          style={{ left: pos.left, top: pos.top, width: Math.min(BREITE, window.innerWidth - 2 * RAND) }}
        >
          <span className="block font-medium">{titel}</span>
          {zeilen.map(([k, v], i) => (
            <span key={`${k}-${i}`} className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold tabular-nums">{v}</span>
            </span>
          ))}
          <span className="mt-2 block leading-snug text-muted-foreground">{text}</span>
        </div>,
        document.body,
      )}
    </div>
  )
}
