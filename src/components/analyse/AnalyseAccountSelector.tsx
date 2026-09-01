'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import { ChevronDown, Check, Landmark } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'

export interface AnalyseAccountOption {
  id:    string
  name:  string
  type:  string
  color: string | null
}

const TYPE_LABELS: Record<string, string> = {
  checking:         'Girokonto',
  savings:          'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment:       'Depot',
  crypto:           'Krypto',
  cash:             'Bargeld',
  credit:           'Kreditkarte',
}

// Grouping used for the "select whole group" checkbox — this is what lets Eric isolate
// "die Banking Konten" (Giro + Spar + Kreditkarte) in one click instead of ticking each
// account individually.
const GROUP_LABELS: Record<string, string> = {
  checking: 'Banking',
  savings:  'Banking',
  credit:   'Banking',
}

interface Props {
  accounts: AnalyseAccountOption[]
  // Selected account ids from the URL. Empty = no filter = alle Konten.
  selected: string[]
}

export function AnalyseAccountSelector({ accounts, selected }: Props) {
  const filters = useUrlFilters()

  if (accounts.length === 0) return null

  const allIds = accounts.map(a => a.id)

  // Anzeige aus dem optimistischen Parameter, nicht aus `selected` — sonst bleiben die
  // Checkboxen stehen, bis der Server geantwortet hat, und ein Klick fühlt sich verloren an.
  // Ohne Parameter in der URL gilt weiter die vom Server aufgelöste Standardauswahl.
  const raw = filters.get('accounts')
  const current = raw === null
    ? selected
    : raw === 'all'
      ? []
      : raw.split(',').filter(Boolean)

  const selectedSet = new Set(current.length > 0 ? current : allIds)
  const isAll = current.length === 0

  function push(ids: string[]) {
    // "all" is an explicit sentinel (not just an absent param) so a deliberate "Alle Konten"
    // click can be told apart from "no override yet" — the latter falls back to the saved
    // Analyse-Standardauswahl from Settings, the former must stick regardless of that default.
    filters.set('accounts', ids.length === 0 || ids.length === allIds.length ? 'all' : ids.join(','))
  }

  function toggleAccount(id: string) {
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    push([...next])
  }

  // Group accounts by their "Banking"-style group label so related account types
  // (Giro, Spar, Kreditkarte) sit together under one shared toggle.
  const groups = new Map<string, { label: string; accounts: AnalyseAccountOption[] }>()
  for (const a of accounts) {
    const groupKey = GROUP_LABELS[a.type] ?? a.type
    const group = groups.get(groupKey) ?? { label: GROUP_LABELS[a.type] ?? TYPE_LABELS[a.type] ?? a.type, accounts: [] }
    group.accounts.push(a)
    groups.set(groupKey, group)
  }

  function toggleGroup(groupKey: string) {
    const groupIds = (groups.get(groupKey)?.accounts ?? []).map(a => a.id)
    const allSelected = groupIds.every(id => selectedSet.has(id))
    const next = new Set(selectedSet)
    if (allSelected) groupIds.forEach(id => next.delete(id))
    else groupIds.forEach(id => next.add(id))
    push([...next])
  }

  const triggerLabel = isAll
    ? 'Alle Konten'
    : current.length === 1
      ? accounts.find(a => a.id === current[0])?.name ?? '1 Konto'
      : `${current.length} Konten`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-muted/50 ${filters.pending ? 'opacity-60' : ''}`}
        >
          <span className="text-muted-foreground">Konten</span>
          <span className="font-medium max-w-[140px] truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-1.5">
        <button
          type="button"
          onClick={() => push([])}
          className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
            isAll ? 'font-medium text-foreground' : 'text-muted-foreground'
          }`}
        >
          Alle Konten
          {isAll && <Check className="size-3.5" />}
        </button>

        <div className="my-1 h-px bg-border" />

        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-0.5">
          {[...groups.entries()].map(([groupKey, group]) => {
            const groupIds = group.accounts.map(a => a.id)
            const groupChecked = groupIds.every(id => selectedSet.has(id))
            const groupPartial = !groupChecked && groupIds.some(id => selectedSet.has(id))

            return (
              <div key={groupKey}>
                <label className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={groupChecked ? true : groupPartial ? 'indeterminate' : false}
                    onCheckedChange={() => toggleGroup(groupKey)}
                  />
                  {group.label === 'Banking' && <Landmark className="size-3" />}
                  {group.label}
                </label>
                <div className="space-y-0.5">
                  {group.accounts.map(a => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 pl-6 text-sm transition-colors hover:bg-accent cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={selectedSet.has(a.id)}
                        onCheckedChange={() => toggleAccount(a.id)}
                      />
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: a.color ?? '#94a3b8' }}
                      />
                      <span className="truncate">{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
