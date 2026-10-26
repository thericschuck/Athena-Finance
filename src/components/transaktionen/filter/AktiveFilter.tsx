'use client'

import { X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { ART_LABEL, OHNE_KATEGORIE, TYP_LABEL, aktivesPreset } from '@/lib/transaktionen/filter'
import { datumDe, istArt, istTyp, type KategorieOption, type KontoOption } from './felder'

/** Alle inhaltlichen Filter. `sort` und `per` sind Ansichtseinstellungen und bleiben beim Zurücksetzen stehen. */
export const INHALT_KEYS = ['type', 'art', 'account', 'category', 'from', 'to', 'q', 'min', 'max'] as const

export function alleLoeschen(): Record<(typeof INHALT_KEYS)[number], null> {
  return Object.fromEntries(INHALT_KEYS.map(k => [k, null])) as Record<(typeof INHALT_KEYS)[number], null>
}

const zahlDe = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : v
}

interface Chip {
  id: string
  text: string
  /** Parameter, die der Chip löscht. */
  keys: string[]
}

/**
 * Aktive Filter als Chips unter der Leiste. Jeder Chip löscht genau seinen Filter (eine Navigation);
 * „Alle zurücksetzen“ löscht alle inhaltlichen Filter, aber nicht Sortierung und Seitengröße.
 * Keine Chips für die Sortierung und für Voreinstellungen des Zeitraums (die stehen markiert in der Chip-Reihe).
 */
export function AktiveFilter({
  accounts, categories, heute, onAlleZuruecksetzen,
}: {
  accounts: KontoOption[]
  categories: KategorieOption[]
  heute: string
  onAlleZuruecksetzen?: () => void
}) {
  const filters = useUrlFilters()
  const chips: Chip[] = []

  const q = filters.get('q')?.trim()
  if (q) chips.push({ id: 'q', text: `Suche: ${q.length > 24 ? `${q.slice(0, 24)}…` : q}`, keys: ['q'] })

  const typ = filters.get('type')
  if (istTyp(typ)) chips.push({ id: 'type', text: `Typ: ${TYP_LABEL[typ]}`, keys: ['type'] })

  const art = filters.get('art')
  if (istArt(art)) chips.push({ id: 'art', text: `Art: ${ART_LABEL[art]}`, keys: ['art'] })

  const konto = filters.get('account')
  if (konto) {
    // Ein archiviertes/unbekanntes Konto steht nicht in der Auswahl, der Filter wirkt aber — der Chip muss ihn
    // trotzdem zeigen, sonst ist er unsichtbar und nur über „Alle zurücksetzen“ loszuwerden.
    const name = accounts.find(a => a.id === konto)?.name ?? 'archiviertes Konto'
    chips.push({ id: 'account', text: `Konto: ${name}`, keys: ['account'] })
  }

  const kat = filters.get('category')
  if (kat === OHNE_KATEGORIE) chips.push({ id: 'category', text: 'Ohne Kategorie', keys: ['category'] })
  else if (kat) {
    const name = categories.find(c => c.id === kat)?.name
    if (name) chips.push({ id: 'category', text: `Kategorie: ${name}`, keys: ['category'] })
  }

  const from = filters.get('from') ?? undefined
  const to = filters.get('to') ?? undefined
  if (!aktivesPreset(from, to, heute)) {
    if (from) chips.push({ id: 'from', text: `ab ${datumDe(from)}`, keys: ['from'] })
    if (to) chips.push({ id: 'to', text: `bis ${datumDe(to)}`, keys: ['to'] })
  }

  const min = filters.get('min')
  if (min && Number.isFinite(Number(min))) chips.push({ id: 'min', text: `≥ ${zahlDe(min)} €`, keys: ['min'] })
  const max = filters.get('max')
  if (max && Number.isFinite(Number(max))) chips.push({ id: 'max', text: `≤ ${zahlDe(max)} €`, keys: ['max'] })

  // „Alle zurücksetzen“ auch dann, wenn nur ein Zeitraum-Preset aktiv ist (der hat keinen eigenen Chip).
  const irgendwas = chips.length > 0 || Boolean(from || to)
  if (!irgendwas) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Aktive Filter">
      {chips.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => filters.setMany(Object.fromEntries(c.keys.map(k => [k, null])))}
          aria-label={`Filter entfernen: ${c.text}`}
          className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 pl-3 pr-2.5 text-sm text-foreground transition-colors hover:bg-muted md:min-h-7 md:py-0.5 md:text-xs"
        >
          <span className="truncate">{c.text}</span>
          <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          onAlleZuruecksetzen?.()
          filters.setMany(alleLoeschen())
        }}
        className="inline-flex min-h-10 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-7 md:text-xs"
      >
        Alle zurücksetzen
      </button>
    </div>
  )
}
