'use client'

import { X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'

/**
 * Sichtbare Anzeige aller aktiven Filter aus der URL (Monat, Konto, Gegenpartei, Kategorie).
 * Ohne sie wäre ein Filter unsichtbar: man sieht nur, dass plötzlich weniger Buchungen da
 * sind, und sucht den Grund woanders. Jeder Chip hebt seinen Filter auf; „Alle zurücksetzen"
 * erscheint ab zwei aktiven Filtern.
 */
export interface FilterChip {
  key: 'month' | 'konto' | 'partei' | 'kat'
  label: string
}

export function BankFilterChips({ chips }: { chips: FilterChip[] }) {
  const filters = useUrlFilters()
  // Optimistisch: ein soeben entfernter Filter verschwindet sofort, nicht erst nach dem Server.
  const sichtbar = chips.filter(c => filters.get(c.key) !== null)
  if (sichtbar.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
      {sichtbar.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={() => filters.set(c.key, null)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/15"
        >
          {c.label}
          <X className="size-3" />
        </button>
      ))}
      {sichtbar.length > 1 && (
        <button
          type="button"
          onClick={() => filters.setMany({ month: null, konto: null, partei: null, kat: null })}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  )
}
