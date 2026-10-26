'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { cn } from '@/lib/utils'
import { feldKlasse } from './felder'

/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird. */
const SEARCH_DEBOUNCE_MS = 350

/**
 * Suche mit lokalem Entwurf: jede Änderung der URL löst ein Server-Rendering aus, also wird erst nach einer
 * Tippause übernommen. Änderungen von außen (Chip „Suche“ entfernt, Zurücksetzen, Zurück-Knopf) werden
 * ins Feld gespiegelt, aber nicht die, die das Feld selbst gerade ausgelöst hat.
 */
export function SuchFeld({ className }: { className?: string }) {
  const filters = useUrlFilters()
  const urlQuery = filters.get('q') ?? ''
  const [draft, setDraft] = useState(urlQuery)
  const lastPushed = useRef(urlQuery)
  const setzen = useRef(filters.set)
  useEffect(() => { setzen.current = filters.set })

  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery
      setDraft(urlQuery)
    }
  }, [urlQuery])

  useEffect(() => {
    if (draft === lastPushed.current) return
    const id = setTimeout(() => {
      lastPushed.current = draft
      setzen.current('q', draft.trim() ? draft : null)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draft])

  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={120}
        aria-label="Suche"
        placeholder="Beschreibung, Händler …"
        className={cn(feldKlasse, 'w-full pl-8 pr-10 md:pr-8')}
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      {draft && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => setDraft('')}
          className="absolute right-0 top-0 flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:size-8"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
