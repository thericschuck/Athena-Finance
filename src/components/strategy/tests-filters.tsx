'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function TestsFilters() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // reset to page 1 on filter change
    params.delete('page')
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
  const inputClass =
    'h-8 w-20 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Asset Class */}
      <select
        className={selectClass}
        defaultValue={searchParams.get('asset_class') ?? ''}
        onChange={e => update('asset_class', e.target.value)}
      >
        <option value="">Alle Klassen</option>
        <option value="major">Major</option>
        <option value="alt">Alt</option>
      </select>

      {/* Min Cobra Green */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Cobra ▲ ≥</span>
        <input
          type="number" min="0" max="7" step="1"
          className={inputClass}
          defaultValue={searchParams.get('min_cg') ?? ''}
          onChange={e => update('min_cg', e.target.value)}
          placeholder="0–7"
        />
      </div>

      {/* Min Cobra Red */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Cobra ▼ ≥</span>
        <input
          type="number" min="0" max="7" step="1"
          className={inputClass}
          defaultValue={searchParams.get('min_cr') ?? ''}
          onChange={e => update('min_cr', e.target.value)}
          placeholder="0–7"
        />
      </div>

      {/* Min Profit Factor */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">PF ≥</span>
        <input
          type="number" min="0" step="0.1"
          className={inputClass}
          defaultValue={searchParams.get('min_pf') ?? ''}
          onChange={e => update('min_pf', e.target.value)}
          placeholder="1.5"
        />
      </div>

      {/* Min Win Rate */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">WR ≥</span>
        <input
          type="number" min="0" max="100" step="1"
          className={inputClass}
          defaultValue={searchParams.get('min_wr') ?? ''}
          onChange={e => update('min_wr', e.target.value)}
          placeholder="%"
        />
      </div>
    </div>
  )
}
