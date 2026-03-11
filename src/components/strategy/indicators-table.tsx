'use client'

import { useState } from 'react'
import { ExternalLink, ShieldX, RefreshCw, Repeat2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { EditIndicatorDialog, DeleteIndicatorButton } from '@/components/strategy/indicator-form'
import { BacktestsDialog } from '@/components/strategy/performance-form'
import { Database } from '@/types/database'

type Indicator = Database['public']['Tables']['indicators']['Row']
type Perf      = Database['public']['Tables']['indicator_performance']['Row']

type IndicatorWithCobra = Indicator & {
  cobraGreen: number | null
  cobraRed:   number | null
  testCount:  number
}

type SortKey = 'name' | 'author' | 'type' | 'cobra_green' | 'cobra_red' | 'test_count'

function sortRows(rows: IndicatorWithCobra[], key: SortKey, asc: boolean) {
  return [...rows].sort((a, b) => {
    let av: string | number | null
    let bv: string | number | null
    if      (key === 'name')        { av = a.name;       bv = b.name }
    else if (key === 'author')      { av = a.author;     bv = b.author }
    else if (key === 'type')        { av = a.type;       bv = b.type }
    else if (key === 'cobra_green') { av = a.cobraGreen; bv = b.cobraGreen }
    else if (key === 'cobra_red')   { av = a.cobraRed;   bv = b.cobraRed }
    else                            { av = a.testCount;  bv = b.testCount }
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return asc ? cmp : -cmp
  })
}

function CobraScore({ value, color }: { value: number | null; color: 'green' | 'red' }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  const cls = color === 'green'
    ? value >= 6 ? 'text-green-600 dark:text-green-400'
    : value >= 4 ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground'
    : value >= 6 ? 'text-red-600 dark:text-red-400'
    : value >= 4 ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground'
  return <span className={`font-medium tabular-nums ${cls}`}>{value}</span>
}

function SortTh({
  label, sortKey, currentSort, currentDir, onSort, className = '', icon,
}: {
  label?: string
  sortKey: SortKey
  currentSort: SortKey
  currentDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  className?: string
  icon?: React.ReactNode
}) {
  const isActive = currentSort === sortKey
  return (
    <th className={`px-4 py-2.5 font-medium ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer
          ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {icon ?? label}
        {isActive
          ? currentDir === 'desc' ? <ArrowDown className="size-3 shrink-0" /> : <ArrowUp className="size-3 shrink-0" />
          : <ArrowUpDown className="size-3 shrink-0 opacity-40" />}
      </button>
    </th>
  )
}

export function IndicatorsTable({
  rows,
  perfs,
  defaultAssetClass,
  defaultTimeframe,
  initialSort = 'cobra_green',
  initialDir  = 'desc',
}: {
  rows:               IndicatorWithCobra[]
  perfs:              Perf[]
  defaultAssetClass?: string
  defaultTimeframe?:  string
  initialSort?:       SortKey
  initialDir?:        'asc' | 'desc'
}) {
  const [sortKey, setSortKey] = useState<SortKey>(initialSort)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialDir)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = sortRows(rows, sortKey, sortDir === 'asc')

  const thProps = { currentSort: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <SortTh label="Name"   sortKey="name"        {...thProps} />
              <SortTh label="Author" sortKey="author"      {...thProps} />
              <SortTh label="Typ"    sortKey="type"        {...thProps} />
              <th className="px-3 py-2.5 font-medium text-muted-foreground text-center" aria-label="Repaints">
                <Repeat2 className="size-3.5 mx-auto" />
              </th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground text-center" title="Verboten">
                <ShieldX className="size-3.5 mx-auto" />
              </th>
              <SortTh label="Cobra ▲" sortKey="cobra_green" {...thProps} className="text-right justify-end" />
              <SortTh label="Cobra ▼" sortKey="cobra_red"   {...thProps} className="text-right justify-end" />
              <SortTh label="Tests"   sortKey="test_count"  {...thProps} className="text-center justify-center" />
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((ind, i) => (
              <tr
                key={ind.id}
                className={`group hover:bg-muted/30 transition-colors
                  ${i < sorted.length - 1 ? 'border-b border-border' : ''}
                  ${ind.is_forbidden ? 'opacity-50' : ''}`}
              >
                {/* Name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ind.name}</span>
                    {ind.tv_url && (
                      <a href={ind.tv_url} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {ind.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate">{ind.notes}</p>
                  )}
                </td>

                {/* Author */}
                <td className="px-4 py-3 text-muted-foreground">{ind.author}</td>

                {/* Typ */}
                <td className="px-4 py-3">
                  <div>
                    <span>{ind.type}</span>
                    {ind.subtype && <p className="text-xs text-muted-foreground">{ind.subtype}</p>}
                  </div>
                </td>

                {/* Repaints */}
                <td className="px-3 py-3 text-center">
                  {ind.repaints
                    ? <RefreshCw className="size-3.5 text-amber-500 mx-auto" aria-label="Repaints" />
                    : <span className="text-muted-foreground/30">—</span>}
                </td>

                {/* Forbidden */}
                <td className="px-3 py-3 text-center">
                  {ind.is_forbidden
                    ? <ShieldX className="size-3.5 text-destructive mx-auto" aria-label={ind.forbidden_reason ?? 'Verboten'} />
                    : <span className="text-muted-foreground/30">—</span>}
                </td>

                {/* Cobra Green */}
                <td className="px-4 py-3 text-right">
                  <CobraScore value={ind.cobraGreen} color="green" />
                </td>

                {/* Cobra Red */}
                <td className="px-4 py-3 text-right">
                  <CobraScore value={ind.cobraRed} color="red" />
                </td>

                {/* Tests count */}
                <td className="px-4 py-3 text-center">
                  <BacktestsDialog
                    ind={ind}
                    perfs={perfs}
                    defaultAssetClass={defaultAssetClass}
                    defaultTimeframe={defaultTimeframe}
                  />
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditIndicatorDialog ind={ind} />
                    <DeleteIndicatorButton ind={ind} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
