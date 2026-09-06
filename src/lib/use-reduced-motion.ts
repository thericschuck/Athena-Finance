'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion as useFramerReducedMotion } from 'framer-motion'

/**
 * SSR-sichere Fassung von framer-motions `useReducedMotion`.
 *
 * Das Original liest `window.matchMedia` SYNCHRON schon im allerersten Render
 * (siehe Quelle: `useState(prefersReducedMotion.current)`, ohne SSR-Guard) —
 * auf dem Server (kein `window`) liefert das immer `false`, auf dem Client
 * sofort den ECHTEN Wert. Hat ein/e Nutzer:in Reduced Motion tatsächlich
 * aktiviert, weichen Server- und erster Client-Render damit STRUKTURELL
 * voneinander ab, sobald der Wert über das Markup entscheidet (ganze
 * Abschnitte rendern anders je nach `still`) — ein garantierter
 * Hydration-Mismatch, den React zwar mit einem kompletten Client-Neu-Render
 * "heilt", aber sichtbar als Flackern beim Laden.
 *
 * Fix: den echten Wert erst NACH dem Mounten übernehmen (klassisches
 * "hasMounted"-Muster). Der erste Client-Render bleibt dadurch exakt so wie
 * der Server-Render (immer `false`); das Umschalten auf Reduced Motion
 * passiert einen Tick später als ganz normaler, unverdächtiger Re-Render
 * statt während der Hydration selbst.
 *
 * Lag als lokale Funktion in `LandingClient.tsx`, bis die Settings-Tabs
 * denselben Guard brauchten — bewusst gleicher Name wie das Original, damit
 * bestehende `useReducedMotion()`-Aufrufe unverändert diese sichere Fassung
 * bekommen.
 */
export function useReducedMotion(): boolean {
  // framer-motion liefert `boolean | null` (`null` = noch nicht ermittelt).
  // Hier immer ein echtes Boolean, damit Aufrufer den Wert direkt in
  // `initial`/`exit`-Props stecken koennen, ohne auf `null` zu pruefen.
  const prefersReduced = useFramerReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? prefersReduced === true : false
}
