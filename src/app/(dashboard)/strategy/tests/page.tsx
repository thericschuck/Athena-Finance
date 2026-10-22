import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import {
  getIndicatorInfos, getPerformanceFiltered,
  type IndicatorInfo, type IndicatorPerformanceRow,
} from '@/lib/data/strategy'
import { TestsFilters } from '@/components/strategy/tests-filters'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { AddBacktestStandaloneDialog } from '@/components/strategy/performance-form'
import { TestsTable } from '@/components/strategy/tests-table'
import { Suspense } from 'react'

type Row = IndicatorPerformanceRow & { indicator: IndicatorInfo | null }

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

  const { supabase, user } = await requireAuthUser()

  const settings = await getSettings(user!.id)
  const defaultAssetClass = (settings.default_asset_class as string) ?? 'major'
  const defaultTimeframe  = (settings.default_timeframe  as string) ?? ''

  // Load indicators for this user
  const indicatorMap = new Map<string, IndicatorInfo>(
    (await getIndicatorInfos(supabase, user!.id)).map(i => [i.id, i])
  )

  // Load all performance entries for these indicators
  const rawPerfs = await getPerformanceFiltered(supabase, [...indicatorMap.keys()], {
    assetClass, minCobraGreen: minCg, minCobraRed: minCr, minProfitFactor: minPf, minWinRate: minWr,
  })

  // Merge with indicator info
  const rows: Row[] = rawPerfs.map(p => ({
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

      {/* Filters + Table — `resetKeys="page"` springt bei jeder Filteränderung
          zurück auf Seite 1. */}
      <Suspense>
        <UrlFiltersProvider replace resetKeys="page">
          <div className="space-y-6">
            <TestsFilters />

            <FilterPending>
              <TestsTable rows={rows} />
            </FilterPending>
          </div>
        </UrlFiltersProvider>
      </Suspense>
    </div>
  )
}
