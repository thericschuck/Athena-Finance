'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Darstellungs-Vorlieben, die bewusst NUR auf diesem Gerät gelten (localStorage statt
 * Supabase-Settings): ein Mauszeiger ergibt auf dem Handy keinen Sinn, und wie versteckte
 * Zahlen aussehen, probiert man am Bildschirm durch, auf dem man präsentiert. Änderungen
 * wirken sofort, ohne „Speichern“, auch in anderen offenen Tabs (storage-Event).
 */

export const CURSOR_STILE = ['pfeil', 'system'] as const
export type CursorStil = (typeof CURSOR_STILE)[number]

export const PRIVAT_STILE = ['balken', 'blur', 'punkte'] as const
export type PrivatStil = (typeof PRIVAT_STILE)[number]

const CURSOR_KEY = 'athena:cursor'
const PRIVAT_KEY = 'athena:privacy-style'
const EVENT = 'athena:lokale-darstellung'

function lies<T extends string>(key: string, erlaubt: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && (erlaubt as readonly string[]).includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function schreibe(key: string, wert: string) {
  try {
    localStorage.setItem(key, wert)
  } catch {
    // Privates Fenster o. Ä. — die Wahl gilt dann nur bis zum Neuladen nicht.
  }
  window.dispatchEvent(new Event(EVENT))
}

function abonniere(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

function useLokal<T extends string>(key: string, erlaubt: readonly T[], fallback: T): [T, (v: T) => void] {
  const wert = useSyncExternalStore(
    abonniere,
    () => lies(key, erlaubt, fallback),
    () => fallback,
  )
  const setze = useCallback((v: T) => schreibe(key, v), [key])
  return [wert, setze]
}

export function useCursorStil() {
  return useLokal<CursorStil>(CURSOR_KEY, CURSOR_STILE, 'pfeil')
}

export function usePrivatStil() {
  return useLokal<PrivatStil>(PRIVAT_KEY, PRIVAT_STILE, 'balken')
}

/** Media Query als Hook; auf dem Server immer `false`, damit nichts Zeiger-Spezifisches vorgerendert wird. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    cb => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
