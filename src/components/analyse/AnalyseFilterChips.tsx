'use client'

import { X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'

/**
 * Aktive Drill-down-Filter (Kategorie, Monat, Tag, Gegenpartei) als entfernbare Chips. Ohne sie
 * wäre ein Filter unsichtbar: die Buchungsliste unten zeigt plötzlich weniger, und man sucht den
 * Grund woanders. „Alle zurücksetzen" erscheint ab zwei Filtern.
 *
 * Die Beschriftungen entstehen HIER aus der URL, nicht auf dem Server: Kategorie, Tag und
 * Gegenpartei werden ohne Server-Rendering gesetzt (siehe `localKeys` in url-filters.tsx), eine
 * serverseitig gebildete Chip-Liste wäre nach dem Klick veraltet.
 */
export function AnalyseFilterChips({
  kategorien, locale,
}: {
  kategorien: { id: string; name: string }[]
  locale: string
}) {
  const filters = useUrlFilters()
  const kat = filters.get('kat')
  const monat = filters.get('monat')
  const tag = filters.get('tag')
  const partei = filters.get('partei')

  const gueltigerMonat = monat && /^\d{4}-(0[1-9]|1[0-2])$/.test(monat) ? monat : null
  const gueltigerTag = tag && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(tag) ? tag : null

  const chips: { key: 'kat' | 'monat' | 'tag' | 'partei'; label: string }[] = [
    ...(kat
      ? [{ key: 'kat' as const, label: `Kategorie: ${kat === 'offen' ? 'Ohne Kategorie' : kategorien.find(k => k.id === kat)?.name ?? 'Kategorie'}` }]
      : []),
    ...(gueltigerMonat
      ? [{
          key: 'monat' as const,
          label: `Nur ${new Date(Number(gueltigerMonat.slice(0, 4)), Number(gueltigerMonat.slice(5, 7)) - 1, 1)
            .toLocaleDateString(locale, { month: 'long', year: 'numeric' })}`,
        }]
      : []),
    ...(gueltigerTag
      ? [{
          key: 'tag' as const,
          label: new Date(`${gueltigerTag}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
        }]
      : []),
    ...(partei ? [{ key: 'partei' as const, label: `Gegenpartei: ${partei}` }] : []),
  ]
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
      {chips.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={() => filters.set(c.key, null)}
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/15"
        >
          <span className="truncate">{c.label}</span>
          <X className="size-3 shrink-0" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => filters.setMany({ kat: null, monat: null, tag: null, partei: null })}
          className="min-h-8 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  )
}
