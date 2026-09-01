'use client'

import { useUrlFilters } from '@/components/providers/url-filters'

type Props = {
  types:   string[]
  authors: string[]
}

export function IndicatorFilters({ types, authors }: Props) {
  const filters = useUrlFilters()
  const update = (key: string, value: string) => filters.set(key, value)

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Typ */}
      <select
        className={selectClass}
        value={filters.get('type') ?? ''}
        onChange={e => update('type', e.target.value)}
      >
        <option value="">Alle Typen</option>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {/* Author */}
      <select
        className={selectClass}
        value={filters.get('author') ?? ''}
        onChange={e => update('author', e.target.value)}
      >
        <option value="">Alle Autoren</option>
        {authors.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* Nur erlaubte */}
      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
        <input
          type="checkbox"
          className="rounded border-input"
          checked={filters.get('allowed') === '1'}
          onChange={e => update('allowed', e.target.checked ? '1' : '')}
        />
        Nur erlaubte
      </label>
    </div>
  )
}
