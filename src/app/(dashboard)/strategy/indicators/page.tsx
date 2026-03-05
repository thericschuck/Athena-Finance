import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { ExternalLink, ShieldX, RefreshCw, Repeat2 } from 'lucide-react'
import { AddIndicatorDialog, EditIndicatorDialog, DeleteIndicatorButton } from '@/components/strategy/indicator-form'
import { BacktestsDialog } from '@/components/strategy/performance-form'
import { IndicatorFilters } from '@/components/strategy/indicator-filters'
import { Suspense } from 'react'

type Indicator = Database['public']['Tables']['indicators']['Row']
type Perf      = Database['public']['Tables']['indicator_performance']['Row']

type IndicatorWithCobra = Indicator & {
  cobraGreen: number | null
  cobraRed:   number | null
  testCount:  number
}

// ─── Cobra score badge ────────────────────────────────────────────────────────
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function IndicatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; author?: string; allowed?: string }>
}) {
  const params       = await searchParams
  const filterType   = params.type
  const filterAuthor = params.author
  const onlyAllowed  = params.allowed === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Build indicator query
  let query = supabase
    .from('indicators')
    .select('*')
    .eq('user_id', user!.id)

  if (filterType)   query = query.eq('type', filterType)
  if (filterAuthor) query = query.eq('author', filterAuthor)
  if (onlyAllowed)  query = query.eq('is_forbidden', false)

  const { data: rawIndicators } = await query.order('name')
  const indicators = rawIndicators ?? []

  // Load performance entries for these indicators
  const indicatorIds = indicators.map(i => i.id)
  const { data: rawPerfs } = indicatorIds.length
    ? await supabase
        .from('indicator_performance')
        .select('*')
        .in('indicator_id', indicatorIds)
        .order('created_at', { ascending: false })
    : { data: [] }
  const perfs = rawPerfs ?? []

  // Aggregate cobra scores per indicator
  const cobraMap = new Map<string, { green: number | null; red: number | null; count: number }>()
  for (const p of perfs) {
    const curr = cobraMap.get(p.indicator_id)
    cobraMap.set(p.indicator_id, {
      green: curr
        ? (p.cobra_green != null ? Math.max(curr.green ?? -Infinity, p.cobra_green) : curr.green)
        : p.cobra_green,
      red: curr
        ? (p.cobra_red != null ? Math.max(curr.red ?? -Infinity, p.cobra_red) : curr.red)
        : p.cobra_red,
      count: (curr?.count ?? 0) + 1,
    })
  }

  // Merge and sort by best cobra_green DESC
  const enriched: IndicatorWithCobra[] = indicators.map(i => ({
    ...i,
    cobraGreen: cobraMap.get(i.id)?.green ?? null,
    cobraRed:   cobraMap.get(i.id)?.red   ?? null,
    testCount:  cobraMap.get(i.id)?.count ?? 0,
  }))
  enriched.sort((a, b) => (b.cobraGreen ?? -1) - (a.cobraGreen ?? -1))

  // Unique filter options (from unfiltered data for better UX — load all)
  const { data: allIndicators } = await supabase
    .from('indicators')
    .select('type, author')
    .eq('user_id', user!.id)

  const allTypes   = [...new Set((allIndicators ?? []).map(i => i.type))].sort()
  const allAuthors = [...new Set((allIndicators ?? []).map(i => i.author))].sort()

  const forbiddenCount = enriched.filter(i => i.is_forbidden).length
  const repaintsCount  = enriched.filter(i => i.repaints).length

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Indicator Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {enriched.length} Indikatoren
            {forbiddenCount > 0 && ` · ${forbiddenCount} verboten`}
            {repaintsCount  > 0 && ` · ${repaintsCount} repaints`}
          </p>
        </div>
        <AddIndicatorDialog />
      </div>

      {/* Filters */}
      <Suspense>
        <IndicatorFilters types={allTypes} authors={allAuthors} />
      </Suspense>

      {/* Table */}
      {enriched.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Author</th>
                  <th className="px-4 py-2.5 font-medium">Typ</th>
                  <th className="px-3 py-2.5 font-medium text-center" aria-label="Repaints">
                    <Repeat2 className="size-3.5 mx-auto" />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center" title="Verboten">
                    <ShieldX className="size-3.5 mx-auto" />
                  </th>
                  <th className="px-4 py-2.5 font-medium text-right">Cobra ▲</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cobra ▼</th>
                  <th className="px-4 py-2.5 font-medium text-center">Tests</th>
                  <th className="w-20 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {enriched.map((ind, i) => (
                  <IndicatorRow
                    key={ind.id}
                    ind={ind}
                    perfs={perfs}
                    isLast={i === enriched.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────
function IndicatorRow({
  ind, perfs, isLast,
}: {
  ind:    IndicatorWithCobra
  perfs:  Perf[]
  isLast: boolean
}) {
  return (
    <tr className={`group hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''} ${ind.is_forbidden ? 'opacity-50' : ''}`}>
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

      {/* Tests count / Backtests dialog */}
      <td className="px-4 py-3 text-center">
        <BacktestsDialog ind={ind} perfs={perfs} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditIndicatorDialog ind={ind} />
          <DeleteIndicatorButton ind={ind} />
        </div>
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Indikatoren</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Füge deinen ersten Indikator hinzu und verfolge seine Performance.
      </p>
    </div>
  )
}
