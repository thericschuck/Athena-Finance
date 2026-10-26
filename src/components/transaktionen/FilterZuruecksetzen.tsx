'use client'

import { Button } from '@/components/ui/button'
import { useUrlFilters } from '@/components/providers/url-filters'

/** Inhaltliche Filter der Seite — Sortierung und Seitengröße (`sort`, `per`) bleiben bewusst stehen. */
const FILTER_SCHLUESSEL = ['type', 'art', 'account', 'category', 'from', 'to', 'q', 'min', 'max'] as const

/**
 * „Filter zurücksetzen“ für Leerzustände. Löscht nur die Filter (`clear()` räumte ALLE Adressparameter
 * ab und verlor dabei Sortierung und Seitengröße); die Seite springt per `resetKeys` auf Seite 1.
 * Muss innerhalb des UrlFiltersProvider liegen, damit die Liste dabei abblendet wie beim Filtern.
 */
export function FilterZuruecksetzen() {
  const { setMany, pending } = useUrlFilters()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-3 h-10 md:h-8"
      disabled={pending}
      onClick={() => setMany(Object.fromEntries(FILTER_SCHLUESSEL.map((k) => [k, null])))}
    >
      Filter zurücksetzen
    </Button>
  )
}
