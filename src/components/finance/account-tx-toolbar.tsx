'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'

interface Category { id: string; name: string; icon: string | null }

interface Props {
  categories: Category[]
  /** Nur die Kategorien anbieten, die auf diesem Konto im Zeitraum vorkommen. */
  usedCategoryIds: string[]
  /** Buchungen im Zeitraum nach allen Filtern — für die Zeile unter der Leiste. */
  shown: number
  /** Buchungen im Zeitraum vor Suche/Kategorie/Typ. */
  total: number
}

const TYPES = [
  { value: 'income',   label: 'Einnahmen' },
  { value: 'expense',  label: 'Ausgaben' },
  { value: 'transfer', label: 'Umbuchungen' },
]

/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird. */
const SEARCH_DEBOUNCE_MS = 300

export function AccountTxToolbar({ categories, usedCategoryIds, shown, total }: Props) {
  const filters = useUrlFilters()

  // Die Suche schreibt wie die anderen Filter in die URL, aber nicht bei jedem Tastendruck:
  // jede Änderung löst ein Server-Rendering aus. Deshalb ein lokaler Entwurf, der erst nach
  // einer Tippause übernommen wird.
  const urlQuery = filters.get('q') ?? ''
  const [draft, setDraft] = useState(urlQuery)
  const lastPushed = useRef(urlQuery)

  // Änderungen von außen (Zurücksetzen, Zurück-Button) ins Feld spiegeln — aber nicht die,
  // die wir gerade selbst ausgelöst haben.
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
      filters.set('q', draft || null)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draft, filters])

  const fieldClass =
    'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground ' +
    'focus:outline-none focus:ring-1 focus:ring-ring'

  // Eine Kategorieliste mit allen 40 Kategorien ist auf einem einzelnen Konto unbrauchbar —
  // die meisten kommen dort nie vor. Also nur die, die hier tatsächlich auftauchen.
  const used = new Set(usedCategoryIds)
  const relevant = categories.filter(c => used.has(c.id))

  const active = ['q', 'cat', 'txtype'].some(k => filters.get(k))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            aria-label="Buchungen durchsuchen"
            placeholder="Beschreibung, Empfänger …"
            className={`${fieldClass} w-56 pl-7 pr-7`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          {draft && (
            <button
              type="button"
              aria-label="Suche leeren"
              onClick={() => setDraft('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {relevant.length > 1 && (
          <select
            aria-label="Kategorie"
            className={fieldClass}
            value={filters.get('cat') ?? ''}
            onChange={e => filters.set('cat', e.target.value || null)}
          >
            <option value="">Alle Kategorien</option>
            {relevant.map(c => (
              <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
            ))}
            <option value="none">— ohne Kategorie</option>
          </select>
        )}

        <select
          aria-label="Typ"
          className={fieldClass}
          value={filters.get('txtype') ?? ''}
          onChange={e => filters.set('txtype', e.target.value || null)}
        >
          <option value="">Alle Typen</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {active && (
          <button
            type="button"
            onClick={() => {
              setDraft('')
              lastPushed.current = ''
              filters.setMany({ q: null, cat: null, txtype: null })
            }}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {active && (
        <p className="text-xs text-muted-foreground">
          {shown} von {total} Buchungen im Zeitraum
        </p>
      )}
    </div>
  )
}

/**
 * Sortierbare Spaltenüberschrift. Der Zustand liegt in der URL (`sort`), damit die
 * Sortierung einen Reload und den Zurück-Button überlebt — und damit der Server sortiert
 * statt der Browser: bei 575 Buchungen ist das der Unterschied zwischen "sofort" und
 * "kurz hakelig".
 */
export function SortableHeader({
  field,
  label,
  align = 'left',
  className = '',
}: {
  field: 'date' | 'amount'
  label: string
  align?: 'left' | 'right'
  className?: string
}) {
  const filters = useUrlFilters()
  const current = filters.get('sort') ?? 'date-desc'
  const [activeField, direction] = current.split('-')
  const isActive = activeField === field

  // Beim Wechsel der Spalte mit der sinnvolleren Richtung starten: Daten neueste zuerst,
  // Beträge größte zuerst — beides absteigend, aber ein Klick soll nie "alt zuerst" zeigen.
  const next = isActive
    ? `${field}-${direction === 'desc' ? 'asc' : 'desc'}`
    : `${field}-desc`

  return (
    <th className={`px-4 py-3 font-medium text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => filters.set('sort', next === 'date-desc' ? null : next)}
        aria-label={`Nach ${label} sortieren`}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          isActive ? 'text-foreground' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <span aria-hidden="true" className={isActive ? 'opacity-100' : 'opacity-25'}>
          {isActive && direction === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    </th>
  )
}

/**
 * Zeigt den per Klick gewählten Monat und hebt ihn wieder auf.
 *
 * Eigene Client-Komponente, weil das Aufheben in die URL schreiben muss — die Seite
 * darum herum ist eine Server-Komponente und kann keinen Handler durchreichen.
 */
export function MonthChip({ label }: { label: string }) {
  const filters = useUrlFilters()
  return (
    <button
      type="button"
      onClick={() => filters.set('month', null)}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground hover:bg-primary/15 transition-colors"
    >
      Nur {label}
      <X className="size-3" />
    </button>
  )
}
