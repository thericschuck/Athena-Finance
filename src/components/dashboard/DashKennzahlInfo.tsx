'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

/**
 * Zelle der Dashboard-Kennzahlenleiste mit Erklärungskarte (Muster: AnalyseKennzahlInfo).
 *
 * Warum ein Portal: die Leiste ist waagerecht scrollbar (`overflow-x-auto`) und schneidet absolut
 * positionierte Kinder ab. Die Karte liegt deshalb im `document.body` (`position: fixed`), unter der
 * Zelle und am Bildschirmrand eingeklemmt, damit sie auf 360 px nicht herausragt.
 *
 * Mit `href` ist die Zelle ein Link (Net Worth → Verlauf). Maus und Tastatur: Hover/Fokus zeigt die
 * Karte, Klick navigiert. Berührung: der erste Tipp öffnet nur die Karte (sonst gäbe es auf dem
 * Handy keine Erklärung), der zweite folgt dem Link.
 *
 * Zeilen mit leerem Wert sind Zwischenüberschriften.
 */

const BREITE = 272
const RAND = 8

export function DashKennzahlInfo({
  titel, zeilen = [], text, children, className, href,
}: {
  titel: string
  zeilen?: readonly (readonly [string, string])[]
  text: string
  children: React.ReactNode
  className?: string
  href?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const beruehrung = useRef(false)
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
    // Scrollen (Seite oder Leiste) schließt; ein Tipp daneben ebenfalls (Berührung kennt kein Mouseleave).
    const daneben = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null)
    }
    window.addEventListener('scroll', schliessen, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('pointerdown', daneben)
    return () => {
      window.removeEventListener('scroll', schliessen, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('pointerdown', daneben)
    }
  }, [pos, schliessen])

  const gemeinsam = {
    className,
    onPointerDown: (e: React.PointerEvent) => { beruehrung.current = e.pointerType === 'touch' },
    onMouseEnter: () => { if (!beruehrung.current) oeffnen() },
    onMouseLeave: schliessen,
    // Nur Tastaturfokus oeffnet: ein Tipp fokussiert das Element ebenfalls, und der folgende Klick
    // schlisse die Karte sofort wieder.
    onFocus: (e: React.FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) oeffnen() },
    onBlur: schliessen,
  }

  const karte = pos && createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-lg border border-border bg-popover p-3 text-xs text-foreground shadow-lg"
      style={{ left: pos.left, top: pos.top, width: Math.min(BREITE, window.innerWidth - 2 * RAND) }}
    >
      <span className="block font-medium">{titel}</span>
      {zeilen.map(([k, v], i) =>
        v === '' ? (
          <span key={`${k}-${i}`} className="mt-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k}</span>
        ) : (
          <span key={`${k}-${i}`} className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold tabular-nums">{v}</span>
          </span>
        ),
      )}
      <span className="mt-2 block leading-snug text-muted-foreground">{text}</span>
    </div>,
    document.body,
  )

  if (href) {
    return (
      <Link
        {...gemeinsam}
        href={href}
        ref={el => { ref.current = el }}
        onClick={e => {
          // Erster Tipp mit dem Finger: nur erklären.
          if (beruehrung.current && !pos) {
            e.preventDefault()
            oeffnen()
          }
        }}
      >
        {children}
        {karte}
      </Link>
    )
  }

  return (
    <div
      {...gemeinsam}
      ref={el => { ref.current = el }}
      tabIndex={0}
      onClick={() => (pos ? schliessen() : oeffnen())}
    >
      {children}
      {karte}
    </div>
  )
}
