'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { Database } from '@/types/database'

type Account = Pick<Database['public']['Tables']['accounts']['Row'], 'id' | 'name' | 'color'>
type Category = Pick<Database['public']['Tables']['categories']['Row'], 'id' | 'name'>

interface TransactionFiltersProps {
  accounts: Account[]
  categories: Category[]
}

const TYPES = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Investition' },
]

const KEYS = ['type', 'account', 'category', 'from', 'to', 'q'] as const

/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird. */
const SEARCH_DEBOUNCE_MS = 350

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  // Die Selects sind kontrolliert: ihr Wert kommt aus dem Filter-Context, nicht direkt aus
  // `useSearchParams()`. Sonst sprang die Auswahl beim Ändern kurz auf den alten Wert
  // zurück, bis der Server geantwortet hatte.
  const filters = useUrlFilters()

  // Die Suche schreibt wie die anderen Filter in die URL, aber nicht bei jedem Tastendruck:
  // jede Aenderung loest ein Server-Rendering aus. Deshalb ein lokaler Entwurf, der erst
  // nach einer Tippause uebernommen wird.
  const urlQuery = filters.get('q') ?? ''
  const [draft, setDraft] = useState(urlQuery)
  const lastPushed = useRef(urlQuery)

  // Aenderungen von aussen (Zuruecksetzen, Zurueck-Button) ins Eingabefeld spiegeln —
  // aber nicht die, die wir gerade selbst ausgeloest haben.
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

  const selectClass =
    'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

  const hasFilters = KEYS.some(k => filters.get(k))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Suche */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="search"
          aria-label="Suche"
          placeholder="Beschreibung, Empfänger …"
          className={`${selectClass} w-52 pl-7 pr-7`}
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

      {/* Typ */}
      <select
        aria-label="Typ"
        className={selectClass}
        value={filters.get('type') ?? ''}
        onChange={(e) => filters.set('type', e.target.value)}
      >
        <option value="">Alle Typen</option>
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Konto */}
      <select
        aria-label="Konto"
        className={selectClass}
        value={filters.get('account') ?? ''}
        onChange={(e) => filters.set('account', e.target.value)}
      >
        <option value="">Alle Konten</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {/* Kategorie */}
      <select
        aria-label="Kategorie"
        className={selectClass}
        value={filters.get('category') ?? ''}
        onChange={(e) => filters.set('category', e.target.value)}
      >
        <option value="">Alle Kategorien</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Von */}
      <input
        type="date"
        aria-label="Von"
        className={selectClass}
        value={filters.get('from') ?? ''}
        onChange={(e) => filters.set('from', e.target.value)}
      />

      {/* Bis */}
      <input
        type="date"
        aria-label="Bis"
        className={selectClass}
        value={filters.get('to') ?? ''}
        onChange={(e) => filters.set('to', e.target.value)}
      />

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={() => filters.clear()}
          className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  )
}
