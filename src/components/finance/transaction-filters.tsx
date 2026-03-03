'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
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

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() =>
      router.replace(`/finance/transactions?${params.toString()}`, { scroll: false })
    )
  }

  const selectClass =
    'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Typ */}
      <select
        className={selectClass}
        value={searchParams.get('type') ?? ''}
        onChange={(e) => update('type', e.target.value)}
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
        className={selectClass}
        value={searchParams.get('account') ?? ''}
        onChange={(e) => update('account', e.target.value)}
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
        className={selectClass}
        value={searchParams.get('category') ?? ''}
        onChange={(e) => update('category', e.target.value)}
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
        className={selectClass}
        value={searchParams.get('from') ?? ''}
        onChange={(e) => update('from', e.target.value)}
      />

      {/* Bis */}
      <input
        type="date"
        className={selectClass}
        value={searchParams.get('to') ?? ''}
        onChange={(e) => update('to', e.target.value)}
      />

      {/* Reset */}
      {(searchParams.get('type') ||
        searchParams.get('account') ||
        searchParams.get('category') ||
        searchParams.get('from') ||
        searchParams.get('to')) && (
        <button
          onClick={() =>
            startTransition(() =>
              router.replace('/finance/transactions', { scroll: false })
            )
          }
          className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  )
}
