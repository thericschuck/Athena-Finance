'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type Props = {
  types:   string[]
  authors: string[]
}

export function IndicatorFilters({ types, authors }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Typ */}
      <select
        className={selectClass}
        defaultValue={searchParams.get('type') ?? ''}
        onChange={e => update('type', e.target.value)}
      >
        <option value="">Alle Typen</option>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {/* Author */}
      <select
        className={selectClass}
        defaultValue={searchParams.get('author') ?? ''}
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
          defaultChecked={searchParams.get('allowed') === '1'}
          onChange={e => update('allowed', e.target.checked ? '1' : '')}
        />
        Nur erlaubte
      </label>
    </div>
  )
}
