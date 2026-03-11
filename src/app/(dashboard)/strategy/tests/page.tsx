import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { Database } from '@/types/database'
import { TestsFilters } from '@/components/strategy/tests-filters'
import { AddBacktestStandaloneDialog } from '@/components/strategy/performance-form'
import { TestsTable } from '@/components/strategy/tests-table'
import { Suspense } from 'react'

type Perf = Database['public']['Tables']['indicator_performance']['Row']
type IndicatorInfo = { id: string; name: string; author: string; type: string }
type Row = Perf & { indicator: IndicatorInfo | null }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams

  const assetClass = params.asset_class
  const minCg  = params.min_cg  ? parseFloat(params.min_cg)  : null
  const minCr  = params.min_cr  ? parseFloat(params.min_cr)  : null
  const minPf  = params.min_pf  ? parseFloat(params.min_pf)  : null
  const minWr  = params.min_wr  ? parseFloat(params.min_wr)  : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const settings = await getSettings(user!.id)
  const defaultAssetClass = (settings.default_asset_class as string) ?? 'major'
  const defaultTimeframe  = (settings.default_timeframe  as string) ?? ''

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

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backtests</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{rows.length} Einträge</p>
        </div>
        <AddBacktestStandaloneDialog
          indicators={[...indicatorMap.values()].map(i => ({ id: i.id, name: i.name }))}
          defaultAssetClass={defaultAssetClass}
          defaultTimeframe={defaultTimeframe}
        />
      </div>

      {/* Filters */}
      <Suspense>
        <TestsFilters />
      </Suspense>

      {/* Table */}
      <TestsTable rows={rows} />
    </div>
  )
}
