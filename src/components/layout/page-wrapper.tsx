'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Notbremse für den Navigations-Balken. Er wird durch einen Klick gestartet und
 * durch die abgeschlossene Navigation beendet — findet die aus irgendeinem
 * Grund nicht statt (abgebrochener Request, Link ins Nichts), liefe er sonst
 * endlos weiter. Nach dieser Zeit ist jede echte Navigation längst durch.
 */
const NAV_BAR_TIMEOUT_MS = 8000

export function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ref = useRef<HTMLDivElement>(null)
  const [navigating, setNavigating] = useState(false)

  // Vollständige URL, nicht nur der Pfad: Links wie `/assistant?s=<id>` (Session
  // wechseln) oder `/assistant/logs?level=error` (Log filtern) navigieren, ohne
  // den Pathname zu ändern. Hing das Zurücksetzen nur am Pathname, blieb der
  // Balken nach so einem Klick dauerhaft am Laufen.
  const url = `${pathname}?${searchParams}`

  // Ref auf die aktuelle URL, damit der Klick-Handler immer den neuesten Wert sieht
  const urlRef = useRef(url)
  useEffect(() => { urlRef.current = url }, [url])

  // Intercept clicks on internal <a> tags → show bar immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        anchor.getAttribute('target') === '_blank' ||
        // Ziel ist die Seite, auf der wir schon stehen → es navigiert nichts.
        // Vergleich gegen die volle URL, sonst zählt ein Klick auf die bereits
        // offene Session als Navigation und startet den Balken ohne Anlass.
        href === urlRef.current ||
        href === urlRef.current.replace(/\?$/, '')
      ) return
      setNavigating(true)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  // URL geändert → Navigation abgeschlossen, Balken aus
  useEffect(() => {
    setNavigating(false)
  }, [url])

  // Notbremse (siehe NAV_BAR_TIMEOUT_MS): läuft der Balken noch, obwohl keine
  // Navigation mehr kommt, hört er hier von selbst auf.
  useEffect(() => {
    if (!navigating) return
    const timer = setTimeout(() => setNavigating(false), NAV_BAR_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [navigating])

  // Einblend-Animation bleibt am Pathname: ein reiner Query-Wechsel (Filter
  // setzen, Session wechseln) ist keine neue Seite und soll nicht jedes Mal
  // die komplette Seite neu einblenden lassen.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove('page-enter-active')
    void el.offsetHeight
    el.classList.add('page-enter-active')
  }, [pathname])

  return (
    <>
      {/* Top navigation progress bar */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden"
        style={{
          opacity: navigating ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      >
        <div
          className="nav-progress-bar h-full w-1/2 bg-primary"
        />
      </div>

      <div ref={ref} className="page-enter-active flex min-w-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </>
  )
}
