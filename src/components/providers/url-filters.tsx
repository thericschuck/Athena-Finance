'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
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
  /**
   * Parameter, die nur im Browser ausgewertet werden und den Server nichts angehen (z. B. die
   * Drill-down-Filter der Analyse-Seite: die Buchungsliste filtert lokal). Ändert ein Aufruf NUR
   * solche Schlüssel, wird die URL per `history.replaceState` geschrieben — ohne Server-Rendering
   * und ohne dass die Seite neu lädt. Next.js hängt `useSearchParams` an die History-API, die URL
   * bleibt also teilbar und der Zurück-Knopf unverändert. Ändert ein Aufruf auch nur einen
   * anderen Schlüssel, gilt der normale Weg. Kommagetrennt: `"kat,tag,partei"`.
   */
  localKeys?: string
}

const UrlFiltersContext = createContext<UrlFilters | null>(null)

export function UrlFiltersProvider({
  children,
  replace = false,
  scroll = false,
  resetKeys,
  localKeys,
}: Options & { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [pending, startTransition] = useTransition()
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(searchParams.toString())

  // Rein lokale Schluessel: sofort sichtbarer Wert (Override) und die jeweils neueste Query als
  // Ref — zwei schnelle Klicks hintereinander duerfen sich nicht gegenseitig ueberschreiben,
  // solange Next die History-Aenderung noch nicht in `searchParams` gespiegelt hat.
  const lokaleSchluessel = useMemo(() => new Set(localKeys?.split(',').filter(Boolean) ?? []), [localKeys])
  const [lokal, setLokal] = useState<Record<string, string | null>>({})
  const queryRef = useRef(optimisticQuery)
  useEffect(() => { queryRef.current = optimisticQuery }, [optimisticQuery])

  const apply = useCallback(
    (mutate: (params: URLSearchParams) => void, touched: string[] = []) => {
      const basis = queryRef.current
      const next = new URLSearchParams(basis)
      mutate(next)
      for (const key of resetKeys?.split(',').filter(Boolean) ?? []) {
        if (!touched.includes(key)) next.delete(key)
      }

      const query = next.toString()
      if (query === basis) return

      // Nur lokale Schluessel geaendert: kein Server-Roundtrip.
      if (lokaleSchluessel.size > 0) {
        const alt = new URLSearchParams(basis)
        const geaendert = [...new Set([...alt.keys(), ...next.keys()])].filter(k => alt.get(k) !== next.get(k))
        if (geaendert.length > 0 && geaendert.every(k => lokaleSchluessel.has(k))) {
          queryRef.current = query
          setLokal(prev => ({ ...prev, ...Object.fromEntries(geaendert.map(k => [k, next.get(k)])) }))
          window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
          return
        }
      }
      // Normale Navigation: die URL traegt die lokalen Werte bereits, Overrides werden unnoetig.
      queryRef.current = query
      setLokal({})

      startTransition(() => {
        setOptimisticQuery(query)
        const url = query ? `${pathname}?${query}` : pathname
        if (replace) router.replace(url, { scroll })
        else router.push(url, { scroll })
      })
    },
    [pathname, replace, scroll, resetKeys, router, setOptimisticQuery, lokaleSchluessel],
  )

  const value = useMemo<UrlFilters>(
    () => ({
      pending,
      get: key => (key in lokal ? lokal[key] : new URLSearchParams(optimisticQuery).get(key)),
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
    [apply, optimisticQuery, pending, lokal],
  )

  return <UrlFiltersContext.Provider value={value}>{children}</UrlFiltersContext.Provider>
}

/**
 * Wie `useUrlFilters`, liefert aber `null` ohne Provider statt zu werfen. Für Komponenten, die
 * auch außerhalb einer filterbaren Seite laufen (die Landingpage zeigt dieselben Charts als
 * Demo): dort gibt es keine URL-Filter, und der Chart bleibt einfach nicht anklickbar.
 */
export function useOptionalUrlFilters(): UrlFilters | null {
  return useContext(UrlFiltersContext)
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
