'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'athena:privacy-hidden'

type PrivacyContextValue = {
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue>({
  hidden: false,
  toggle: () => {},
})

export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext)
}

/**
 * Steuert den Präsentations-Modus (Sidebar-Auge-Icon): blendet Kontostände, Beträge
 * und Chart-Werte per CSS aus (Balken, Milchglas oder Punkte, je nach lokaler Wahl), ohne echte Daten aus dem DOM zu entfernen.
 * Rein client-seitig (localStorage) — Server Components rendern weiterhin die
 * echten Werte, das Blurring passiert erst im Browser, siehe globals.css
 * (`html[data-privacy-hidden] .tabular-nums, ... .privacy-blur`).
 */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)
  const wechselTimer = useRef<number | undefined>(undefined)

  // Das Attribut `data-privacy-hidden` setzt VOR dem ersten Paint das Inline-Skript in app/layout.tsx (aus localStorage). Der State
  // startet bewusst mit `false` (muss zum Server-HTML passen) und wird hier nur nachgezogen; das Attribut wird NICHT aus dem
  // Start-State abgeleitet, sonst entfernte der erste Effekt es wieder und die Betraege waeren bis zum Nachziehen kurz sichtbar.
  useEffect(() => {
    try {
      const gespeichert = localStorage.getItem(STORAGE_KEY) === '1'
      setHidden(gespeichert)
      document.documentElement.toggleAttribute('data-privacy-hidden', gespeichert)
    } catch {
      // localStorage kann in privaten Fenstern o.ä. fehlschlagen — dann bleibt hidden=false.
    }
  }, [])

  const toggle = useCallback(() => {
    // Markiert den Moment des Umschaltens fuer den kurzen Glanz der Balken (globals.css).
    const root = document.documentElement
    root.setAttribute('data-privacy-wechsel', '')
    window.clearTimeout(wechselTimer.current)
    wechselTimer.current = window.setTimeout(() => root.removeAttribute('data-privacy-wechsel'), 1000)
    setHidden(prev => {
      const next = !prev
      root.toggleAttribute('data-privacy-hidden', next)
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // s.o.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}
