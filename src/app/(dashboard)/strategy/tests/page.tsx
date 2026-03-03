import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { TestsFilters } from '@/components/strategy/tests-filters'
import { Suspense } from 'react'

type Perf = Database['public']['Tables']['indicator_performance']['Row']
type IndicatorInfo = { id: string; name: string; author: string; type: string }

type Row = Perf & { indicator: IndicatorInfo | null }

// ─── Sort config ──────────────────────────────────────────────────────────────
type SortKey =
  | 'cobra_green' | 'cobra_red' | 'profit_factor' | 'win_rate'
  | 'net_profit_pct' | 'sharpe' | 'sortino' | 'trades'
  | 'indicator_name' | 'asset' | 'timeframe'

const SORT_DEFAULTS: SortKey = 'cobra_green'

function sortRows(rows: Row[], key: SortKey, asc: boolean): Row[] {
  return [...rows].sort((a, b) => {
    let av: string | number | null
    let bv: string | number | null

    if (key === 'indicator_name') {
      av = a.indicator?.name ?? ''
      bv = b.indicator?.name ?? ''
    } else if (key === 'asset' || key === 'timeframe') {
      av = a[key]
      bv = b[key]
    } else {
      av = a[key as keyof Perf] as number | null
      bv = b[key as keyof Perf] as number | null
    }

    // nulls last
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1

    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return asc ? cmp : -cmp
  })
}

// ─── Sortable header link ─────────────────────────────────────────────────────
function SortTh({
  label, sortKey, currentSort, currentOrder, searchParams,
  className = '',
}: {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  currentOrder: 'asc' | 'desc'
  searchParams: Record<string, string>
  className?: string
}) {
  const isActive  = currentSort === sortKey
  const nextOrder = isActive && currentOrder === 'desc' ? 'asc' : 'desc'
  const params    = new URLSearchParams({ ...searchParams, sort: sortKey, order: nextOrder })

  return (
    <th className={`px-3 py-2.5 font-medium ${className}`}>
      <a
        href={`?${params.toString()}`}
        className={`flex items-center gap-1 whitespace-nowrap transition-colors
          ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {isActive
          ? currentOrder === 'desc'
            ? <ArrowDown className="size-3 shrink-0" />
            : <ArrowUp   className="size-3 shrink-0" />
          : <ArrowUpDown className="size-3 shrink-0 opacity-40" />
        }
      </a>
    </th>
  )
}

// ─── Score cell ───────────────────────────────────────────────────────────────
function CobraCell({ value, color }: { value: number | null; color: 'green' | 'red' }) {
  if (value == null) return <td className="px-3 py-2.5 text-right text-muted-foreground/40">—</td>

  const cls = color === 'green'
    ? value >= 6 ? 'text-green-600 dark:text-green-400 font-semibold'
    : value >= 4 ? 'text-amber-600 dark:text-amber-400 font-medium'
    : 'text-muted-foreground'
    : value >= 6 ? 'text-red-600 dark:text-red-400 font-semibold'
    : value >= 4 ? 'text-amber-600 dark:text-amber-400 font-medium'
    : 'text-muted-foreground'

  return <td className={`px-3 py-2.5 text-right tabular-nums ${cls}`}>{value}</td>
}

function NumCell({ value, decimals = 2, suffix = '' }: {
  value: number | null; decimals?: number; suffix?: string
}) {
  if (value == null) return <td className="px-3 py-2.5 text-right text-muted-foreground/40">—</td>
  return (
    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
      {value.toFixed(decimals)}{suffix}
    </td>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams

  const sortKey   = (params.sort as SortKey) || SORT_DEFAULTS
  const sortOrder = params.order === 'asc' ? 'asc' : 'desc'
  const assetClass = params.asset_class
  const minCg  = params.min_cg  ? parseFloat(params.min_cg)  : null
  const minCr  = params.min_cr  ? parseFloat(params.min_cr)  : null
  const minPf  = params.min_pf  ? parseFloat(params.min_pf)  : null
  const minWr  = params.min_wr  ? parseFloat(params.min_wr)  : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load indicators for this user
  const { data: rawIndicators } = await supabase
    .from('indicators')
    .select('id, name, author, type')
    .eq('user_id', user!.id)

  const indicatorMap = new Map<string, IndicatorInfo>(
    (rawIndicators ?? []).map(i => [i.id, i])
  )
  const userIndicatorIds = [...indicatorMap.keys()]

  // Load all performance entries for these indicators
  let query = supabase
    .from('indicator_performance')
    .select('*')
    .in('indicator_id', userIndicatorIds.length ? userIndicatorIds : ['__none__'])

  if (assetClass) query = query.eq('asset_class', assetClass)
  if (minCg != null) query = query.gte('cobra_green', minCg)
  if (minCr != null) query = query.gte('cobra_red', minCr)
  if (minPf != null) query = query.gte('profit_factor', minPf)
  if (minWr != null) query = query.gte('win_rate', minWr)

  const { data: rawPerfs } = await query

  // Merge with indicator info
  const rows: Row[] = (rawPerfs ?? []).map(p => ({
    ...p,
    indicator: indicatorMap.get(p.indicator_id) ?? null,
  }))

  const sorted = sortRows(rows, sortKey, sortOrder === 'asc')

  // Compact searchParams for SortTh links (without sort/order themselves)
  const baseParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (k !== 'sort' && k !== 'order') baseParams[k] = v
  }

  const sortThProps = { currentSort: sortKey, currentOrder: sortOrder, searchParams: baseParams }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backtests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {sorted.length} Einträge{rows.length !== sorted.length ? ` von ${rows.length}` : ''}
        </p>
      </div>

      {/* Filters */}
      <Suspense>
        <TestsFilters />
      </Suspense>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">Keine Einträge gefunden</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Passe die Filter an oder füge Backtests über die Indikatoren-Seite hinzu.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <SortTh label="Indikator" sortKey="indicator_name" {...sortThProps} className="text-left" />
                  <SortTh label="Asset"     sortKey="asset"          {...sortThProps} className="text-left" />
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-left whitespace-nowrap">Klasse</th>
                  <SortTh label="TF"        sortKey="timeframe"      {...sortThProps} className="text-left" />
                  <SortTh label="Cobra ▲"   sortKey="cobra_green"    {...sortThProps} className="text-right justify-end" />
                  <SortTh label="Cobra ▼"   sortKey="cobra_red"      {...sortThProps} className="text-right justify-end" />
                  <SortTh label="PF"        sortKey="profit_factor"  {...sortThProps} className="text-right justify-end" />
                  <SortTh label="WR %"      sortKey="win_rate"       {...sortThProps} className="text-right justify-end" />
                  <SortTh label="Net %"     sortKey="net_profit_pct" {...sortThProps} className="text-right justify-end" />
                  <SortTh label="Sharpe"    sortKey="sharpe"         {...sortThProps} className="text-right justify-end" />
                  <SortTh label="Sortino"   sortKey="sortino"        {...sortThProps} className="text-right justify-end" />
                  <SortTh label="Trades"    sortKey="trades"         {...sortThProps} className="text-right justify-end" />
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-right whitespace-nowrap">Max DD %</th>
                  <th className="px-3 py-2.5 font-medium text-muted-foreground text-left whitespace-nowrap">Settings</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-muted/30 transition-colors ${i < sorted.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    {/* Indikator */}
                    <td className="px-3 py-2.5">
                      {row.indicator ? (
                        <div>
                          <p className="font-medium whitespace-nowrap">{row.indicator.name}</p>
                          <p className="text-xs text-muted-foreground">{row.indicator.author} · {row.indicator.type}</p>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">Unbekannt</span>}
                    </td>

                    {/* Asset */}
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.asset}</td>

                    {/* Klasse */}
                    <td className="px-3 py-2.5">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium
                        ${row.asset_class === 'major'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                        {row.asset_class}
                      </span>
                    </td>

                    {/* Timeframe */}
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.timeframe}</td>

                    {/* Cobra scores */}
                    <CobraCell value={row.cobra_green} color="green" />
                    <CobraCell value={row.cobra_red}   color="red"   />

                    {/* Metrics */}
                    <NumCell value={row.profit_factor}  decimals={2} />
                    <NumCell value={row.win_rate}        decimals={1} suffix=" %" />
                    <NumCell value={row.net_profit_pct}  decimals={1} suffix=" %" />
                    <NumCell value={row.sharpe}          decimals={2} />
                    <NumCell value={row.sortino}         decimals={2} />
                    <NumCell value={row.trades}          decimals={0} />
                    <NumCell value={row.equity_max_dd}   decimals={1} suffix=" %" />

                    {/* Settings */}
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">
                      {row.settings ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
