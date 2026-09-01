'use client'

import { useUrlFilters } from '@/components/providers/url-filters'

export function TestsFilters() {
  // `resetKeys="page"` im Provider setzt bei jeder Filteränderung auf Seite 1 zurück.
  const filters = useUrlFilters()
  const update = (key: string, value: string) => filters.set(key, value)

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
  const inputClass =
    'h-8 w-20 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Asset Class */}
      <select
        aria-label="Asset-Klasse"
        className={selectClass}
        value={filters.get('asset_class') ?? ''}
        onChange={e => update('asset_class', e.target.value)}
      >
        <option value="">Alle Klassen</option>
        <option value="major">Major</option>
        <option value="alt">Alt</option>
      </select>

      {/* Min Cobra Green */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="min-cg" className="text-xs text-muted-foreground whitespace-nowrap">Cobra ▲ ≥</label>
        <input
          id="min-cg"
          type="number" min="0" max="7" step="1"
          className={inputClass}
          value={filters.get('min_cg') ?? ''}
          onChange={e => update('min_cg', e.target.value)}
          placeholder="0–7"
        />
      </div>

      {/* Min Cobra Red */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="min-cr" className="text-xs text-muted-foreground whitespace-nowrap">Cobra ▼ ≥</label>
        <input
          id="min-cr"
          type="number" min="0" max="7" step="1"
          className={inputClass}
          value={filters.get('min_cr') ?? ''}
          onChange={e => update('min_cr', e.target.value)}
          placeholder="0–7"
        />
      </div>

      {/* Min Profit Factor */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="min-pf" className="text-xs text-muted-foreground whitespace-nowrap">PF ≥</label>
        <input
          id="min-pf"
          type="number" min="0" step="0.1"
          className={inputClass}
          value={filters.get('min_pf') ?? ''}
          onChange={e => update('min_pf', e.target.value)}
          placeholder="1.5"
        />
      </div>

      {/* Min Win Rate */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="min-wr" className="text-xs text-muted-foreground whitespace-nowrap">WR ≥</label>
        <input
          id="min-wr"
          type="number" min="0" max="100" step="1"
          className={inputClass}
          value={filters.get('min_wr') ?? ''}
          onChange={e => update('min_wr', e.target.value)}
          placeholder="%"
        />
      </div>
    </div>
  )
}
