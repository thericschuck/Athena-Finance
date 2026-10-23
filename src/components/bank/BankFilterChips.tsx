'use client'

import { X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { normIban } from '@/lib/bank/scope'

/**
 * Aktive Filter (Monat, Konto, Gegenpartei, Kategorie) als entfernbare Chips. Ohne sie wäre ein
 * Filter unsichtbar: man sieht nur, dass plötzlich weniger Buchungen da sind, und sucht den Grund
 * woanders. „Alle zurücksetzen" erscheint ab zwei aktiven Filtern.
 *
 * Die Beschriftungen entstehen HIER aus der URL, nicht auf dem Server: Gegenpartei, Kategorie
 * und Ansicht werden ohne Server-Rendering gesetzt (`localKeys` in url-filters.tsx), eine
 * serverseitig gebildete Chip-Liste wäre nach dem Klick veraltet.
 */
export function BankFilterChips({
  kategorien, konten, locale,
}: {
  kategorien: { id: string; name: string }[]
  /** IBAN (normalisiert wie in der URL) und Anzeigename. */
  konten: { iban: string; name: string }[]
  locale: string
}) {
  const filters = useUrlFilters()
  const monat = filters.get('month')
  const konto = filters.get('konto')
  const partei = filters.get('partei')
  const kat = filters.get('kat')

  const gueltigerMonat = monat && /^\d{4}-(0[1-9]|1[0-2])$/.test(monat) ? monat : null

  const chips: { key: 'month' | 'konto' | 'partei' | 'kat'; label: string }[] = [
    ...(gueltigerMonat
      ? [{
          key: 'month' as const,
          label: `Nur ${new Date(Number(gueltigerMonat.slice(0, 4)), Number(gueltigerMonat.slice(5, 7)) - 1, 1)
            .toLocaleDateString(locale, { month: 'long', year: 'numeric' })}`,
        }]
      : []),
    ...(konto
      ? [{ key: 'konto' as const, label: `Konto: ${konten.find(k => normIban(k.iban) === normIban(konto))?.name ?? konto}` }]
      : []),
    ...(partei ? [{ key: 'partei' as const, label: `Gegenpartei: ${partei}` }] : []),
    ...(kat
      ? [{ key: 'kat' as const, label: `Kategorie: ${kat === 'offen' ? 'Ohne Kategorie' : kategorien.find(k => k.id === kat)?.name ?? 'Kategorie'}` }]
      : []),
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
          onClick={() => filters.setMany({ month: null, konto: null, partei: null, kat: null })}
          className="min-h-8 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  )
}
