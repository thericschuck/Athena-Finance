'use client'

import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Refreshing } from '@/components/ui/refreshing'

/**
 * Filter, die in der URL stehen und vom Server ausgewertet werden (Zeitraum, Konten, Typ …).
 *
 * Das Problem ohne diesen Provider: die Anzeige hängt an `useSearchParams()`, und die ändern
 * sich erst, wenn der Server geantwortet hat. Ein Klick auf "1J" ließ den Button also eine
 * halbe Sekunde lang unmarkiert — es sah aus, als wäre der Klick verloren gegangen.
 *
 * `useOptimistic` legt den geklickten Wert sofort über die echten Params. React verwirft den
 * optimistischen Stand automatisch, sobald die Transition durch ist und die echten Params
 * nachgezogen sind — auch dann, wenn der Server einen anderen Wert liefert.
 *
 * Deshalb: für die *Anzeige* immer `get()` benutzen, nie `useSearchParams()` direkt.
 *
 * Der Zustand liegt bewusst in einem Context und nicht in jeder Filterleiste einzeln:
 * `pending` wird nicht nur von der Leiste gebraucht, sondern auch vom Inhalt darunter
 * (siehe `<FilterPending>`), und `useTransition` ist immer nur lokal zur Komponente.
 */
export interface UrlFilters {
  /** Aktueller Wert inkl. noch nicht bestätigtem Klick. */
  get: (key: string) => string | null
  /** Setzt einen Parameter; `null`/`''` entfernt ihn. */
  set: (key: string, value: string | null) => void
  /** Mehrere Parameter in einer Navigation. */
  setMany: (entries: Record<string, string | null>) => void
  /** Entfernt alle Parameter. */
  clear: () => void
  /** `true`, solange der Server die neuen Daten noch rendert. */
  pending: boolean
}

interface Options {
  /**
   * `replace` statt `push` — für Filterleisten sinnvoll, damit der Zurück-Button nicht
   * durch jeden einzelnen Filterschritt zurückläuft. Default: `push`.
   */
  replace?: boolean
  /** Beim Navigieren nach oben scrollen. Default: `false`. */
  scroll?: boolean
  /**
   * Parameter, die bei jeder Änderung mitgelöscht werden (z. B. `page` beim Filtern).
   * Als String, damit der Wert zwischen Renderings stabil bleibt: `"page,cursor"`.
   *
   * Ein Schlüssel, der bei DIESEM Aufruf selbst gesetzt wird, ist ausgenommen — sonst
   * könnte der Blätterer `page` nicht über denselben Provider schreiben: der Wert würde
   * unmittelbar nach dem Setzen wieder gelöscht. Gemeint ist „setze zurück, wenn sich
   * etwas ANDERES ändert".
   */
  resetKeys?: string
}

const UrlFiltersContext = createContext<UrlFilters | null>(null)

export function UrlFiltersProvider({
  children,
  replace = false,
  scroll = false,
  resetKeys,
}: Options & { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [pending, startTransition] = useTransition()
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(searchParams.toString())

  const apply = useCallback(
    (mutate: (params: URLSearchParams) => void, touched: string[] = []) => {
      const next = new URLSearchParams(optimisticQuery)
      mutate(next)
      for (const key of resetKeys?.split(',').filter(Boolean) ?? []) {
        if (!touched.includes(key)) next.delete(key)
      }

      const query = next.toString()
      if (query === optimisticQuery) return

      startTransition(() => {
        setOptimisticQuery(query)
        const url = query ? `${pathname}?${query}` : pathname
        if (replace) router.replace(url, { scroll })
        else router.push(url, { scroll })
      })
    },
    [optimisticQuery, pathname, replace, scroll, resetKeys, router, setOptimisticQuery],
  )

  const value = useMemo<UrlFilters>(
    () => ({
      pending,
      get: key => new URLSearchParams(optimisticQuery).get(key),
      set: (key, val) =>
        apply(
          params => {
            if (val) params.set(key, val)
            else params.delete(key)
          },
          [key],
        ),
      setMany: entries =>
        apply(
          params => {
            for (const [key, val] of Object.entries(entries)) {
              if (val) params.set(key, val)
              else params.delete(key)
            }
          },
          Object.keys(entries),
        ),
      clear: () =>
        apply(params => {
          for (const key of [...params.keys()]) params.delete(key)
        }),
    }),
    [apply, optimisticQuery, pending],
  )

  return <UrlFiltersContext.Provider value={value}>{children}</UrlFiltersContext.Provider>
}

export function useUrlFilters(): UrlFilters {
  const ctx = useContext(UrlFiltersContext)
  if (!ctx) throw new Error('useUrlFilters braucht einen <UrlFiltersProvider> weiter oben im Baum')
  return ctx
}

/**
 * Blendet den Inhalt ab, während der Server die gefilterten Daten nachliefert. Kein
 * Skeleton — die alten Zahlen bleiben lesbar stehen, siehe Begründung in `Refreshing`.
 *
 * Muss innerhalb von `<UrlFiltersProvider>` liegen; die (server-gerenderten) Kinder
 * werden als Prop durchgereicht und bleiben Server-Komponenten.
 */
export function FilterPending({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useUrlFilters()
  return (
    <Refreshing pending={pending} className={className}>
      {children}
    </Refreshing>
  )
}
