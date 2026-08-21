'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

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

// Grouping used for the "select whole group" chip — this is what lets Eric isolate
// "die Banking Konten" (Giro + Spar + Kreditkarte) in one click instead of ticking
// each account individually.
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
  const router  = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  if (accounts.length === 0) return null

  const allIds = accounts.map(a => a.id)
  const selectedSet = new Set(selected.length > 0 ? selected : allIds)
  const isAll = selected.length === 0

  function push(ids: string[]) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams)
      if (ids.length === 0 || ids.length === allIds.length) params.delete('accounts')
      else params.set('accounts', ids.join(','))
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  function toggleAccount(id: string) {
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    push([...next])
  }

  // Group accounts by their "Banking"-style group label so related account types
  // (Giro, Spar, Kreditkarte) sit together with one shared toggle chip.
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

  return (
    <div className={`flex flex-wrap items-center gap-1.5 transition-opacity ${pending ? 'opacity-60' : ''}`}>
      <span className="text-xs text-muted-foreground">Konten</span>

      <button
        type="button"
        onClick={() => push([])}
        className={chipClass(isAll)}
      >
        Alle
      </button>

      {[...groups.entries()].map(([groupKey, group]) => {
        const groupIds = group.accounts.map(a => a.id)
        const groupActive = groupIds.every(id => selectedSet.has(id))
        const isMultiAccountGroup = group.accounts.length > 1

        return (
          <div key={groupKey} className="flex items-center gap-1 rounded-full border border-border/60 px-1 py-0.5">
            {isMultiAccountGroup && (
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                title={`Alle ${group.label}-Konten auswählen`}
                className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-full transition-colors ${
                  groupActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {group.label}
              </button>
            )}
            {group.accounts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAccount(a.id)}
                className={chipClass(selectedSet.has(a.id))}
              >
                <span
                  className="mr-1 inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: a.color ?? '#94a3b8' }}
                />
                {a.name}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function chipClass(active: boolean): string {
  return `px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
    active
      ? 'bg-foreground text-background'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`
}
