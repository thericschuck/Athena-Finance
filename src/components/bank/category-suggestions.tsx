'use client'

import { useMemo, useState } from 'react'
import { Wand2, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { normalizeCounterpart } from '@/lib/fints/categorize'
import type { CategorySuggestion, FinanceCategory, SuggestCategoriesResponse } from '@/types/bank'

interface Props {
  categories: FinanceCategory[]
  /** Apply one accepted suggestion — pass useBankData's updateCategory (already optimistic). */
  onAccept: (id: string, categoryId: string) => Promise<void>
}

interface Group {
  key: string
  label: string
  items: CategorySuggestion[]
}

function categoryLabel(c: { icon: string | null; name: string }): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

// Groups by the same normalized-counterparty key the learned-category map uses — "Rewe Markt"
// showing up 15 times is the same recurring expense, not 15 separate decisions. A suggestion
// without a counterparty name (rare) just gets its own single-item group.
function groupSuggestions(suggestions: CategorySuggestion[]): Group[] {
  const groups = new Map<string, Group>()
  for (const s of suggestions) {
    const key = s.counterpart_name ? normalizeCounterpart(s.counterpart_name) : `__single__${s.id}`
    const existing = groups.get(key)
    if (existing) existing.items.push(s)
    else groups.set(key, { key, label: s.counterpart_name ?? s.description ?? '—', items: [s] })
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length)
}

export function CategorySuggestions({ categories, onAccept }: Props) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([])
  // Per-GROUP override, defaults to that group's suggested category — one decision covers
  // every transaction from that counterparty instead of confirming the same category repeatedly.
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [isApplyingAll, setIsApplyingAll] = useState(false)

  const groups = useMemo(() => groupSuggestions(suggestions), [suggestions])

  const loadSuggestions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bank/transactions/suggest-categories')
      const data: SuggestCategoriesResponse = await res.json()
      if (data.error) throw new Error(data.error)
      const list = data.suggestions ?? []
      setSuggestions(list)
      setChosen(Object.fromEntries(
        groupSuggestions(list).map(g => [g.key, g.items[0].suggested_category.id]),
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschläge konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) loadSuggestions()
  }

  const resolvedCategoryId = (g: Group) => chosen[g.key] ?? g.items[0].suggested_category.id

  const accept = async (g: Group) => {
    setBusyKey(g.key)
    try {
      const categoryId = resolvedCategoryId(g)
      await Promise.all(g.items.map(item => onAccept(item.id, categoryId)))
      const ids = new Set(g.items.map(i => i.id))
      setSuggestions(prev => prev.filter(s => !ids.has(s.id)))
    } finally {
      setBusyKey(null)
    }
  }

  const dismiss = (g: Group) => {
    const ids = new Set(g.items.map(i => i.id))
    setSuggestions(prev => prev.filter(s => !ids.has(s.id)))
  }

  const acceptAll = async () => {
    setIsApplyingAll(true)
    try {
      await Promise.all(
        groups.flatMap(g => {
          const categoryId = resolvedCategoryId(g)
          return g.items.map(item => onAccept(item.id, categoryId))
        }),
      )
      setSuggestions([])
    } finally {
      setIsApplyingAll(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Wand2 className="size-4" />
        Kategorien vorschlagen
      </Button>

      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kategorie-Vorschläge</SheetTitle>
          <SheetDescription>
            Nach Empfänger gruppiert — eine Kategorie pro Gruppe übernehmen, statt jede
            einzelne Buchung zu bestätigen. Bei Bedarf danach in der Tabelle einzeln anpassen.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">Lade Vorschläge…</p>
          )}

          {!isLoading && error && (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          )}

          {!isLoading && !error && groups.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Keine offenen Vorschläge — alles ist bereits passend kategorisiert.
            </p>
          )}

          {groups.map(g => (
            <div
              key={g.key}
              className="rounded-lg border border-border p-3 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate flex-1 min-w-0">{g.label}</p>
                {g.items.length > 1 && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {g.items.length}×
                  </span>
                )}
              </div>
              <Select
                value={resolvedCategoryId(g)}
                onValueChange={v => setChosen(prev => ({ ...prev, [g.key]: v }))}
              >
                <SelectTrigger size="sm" className="h-6 w-full rounded-full border-none px-2.5 text-xs shadow-none bg-primary/10 text-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#94a3b8' }} />
                        {categoryLabel(c)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => dismiss(g)}
                  disabled={busyKey === g.key}
                >
                  <X className="size-3.5" />
                  Verwerfen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => accept(g)}
                  disabled={busyKey === g.key}
                >
                  {busyKey === g.key
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Check className="size-3.5" />}
                  {g.items.length > 1 ? `Alle ${g.items.length} übernehmen` : 'Übernehmen'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {suggestions.length > 0 && (
          <SheetFooter>
            <Button onClick={acceptAll} disabled={isApplyingAll}>
              {isApplyingAll
                ? <Loader2 className="size-4 animate-spin" />
                : <Check className="size-4" />}
              Alle {suggestions.length} Buchungen übernehmen ({groups.length} Gruppen)
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
