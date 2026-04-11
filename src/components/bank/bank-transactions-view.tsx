'use client'

import { useEffect, useState } from 'react'
import { Search, TrendingDown, TrendingUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { useSettings } from '@/components/providers/settings-context'
import type { BankTransaction } from '@/types/bank'

interface Props {
  transactions:   BankTransaction[]
  isLoading:      boolean
  onFilter:       (params: { q?: string; category?: string }) => void
}

// Distinct categories from current list
function getCategories(txns: BankTransaction[]): string[] {
  const cats = new Set<string>()
  for (const t of txns) if (t.category) cats.add(t.category)
  return [...cats].sort()
}

export function BankTransactionsView({ transactions, isLoading, onFilter }: Props) {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilter({ q: search || undefined, category: category || undefined })
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category])

  const categories = getCategories(transactions)

  // ── Empty / loading states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Transaktionen werden geladen…
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-4">
        <FilterBar
          search={search} setSearch={setSearch}
          category={category} setCategory={setCategory}
          categories={categories}
        />
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">Keine Transaktionen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Synchronisiere dein Konto, um Transaktionen zu laden.
          </p>
        </div>
      </div>
    )
  }

  // ── Transaction table ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <FilterBar
        search={search} setSearch={setSearch}
        category={category} setCategory={setCategory}
        categories={categories}
      />

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Datum</th>
                <th className="px-4 py-2.5 font-medium">Empfänger / Auftraggeber</th>
                <th className="px-4 py-2.5 font-medium">Beschreibung</th>
                <th className="px-4 py-2.5 font-medium">Kategorie</th>
                <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const isCredit = tx.amount >= 0
                const isLast   = i === transactions.length - 1

                return (
                  <tr
                    key={tx.id}
                    className={`hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {fmtDate(tx.value_date, dateFormat)}
                    </td>
                    <td className="px-4 py-2.5 max-w-[160px]">
                      <span className="truncate block font-medium text-xs">
                        {tx.counterpart_name ?? '—'}
                      </span>
                      {tx.counterpart_iban && (
                        <span className="text-xs text-muted-foreground font-mono truncate block">
                          {tx.counterpart_iban}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {tx.description ?? tx.raw_description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {tx.category ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {tx.category}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className={`flex items-center justify-end gap-1 font-medium ${
                        isCredit
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {isCredit
                          ? <TrendingUp  className="size-3.5 shrink-0" />
                          : <TrendingDown className="size-3.5 shrink-0" />
                        }
                        {isCredit ? '+' : ''}{fmtEur(tx.amount)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {transactions.length} Transaktionen
      </p>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
function FilterBar({
  search, setSearch,
  category, setCategory,
  categories,
}: {
  search: string; setSearch: (v: string) => void
  category: string; setCategory: (v: string) => void
  categories: string[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {categories.length > 0 && (
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Alle Kategorien</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  )
}
