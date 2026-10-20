import { getAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import {
  getIndicators, getPerformanceForIndicators, getIndicatorFilterOptions,
  type IndicatorRow,
} from '@/lib/data/strategy'
import { AddIndicatorDialog } from '@/components/strategy/indicator-form'
import { IndicatorExportDialog, IndicatorImportDialog } from '@/components/strategy/indicator-export-dialog'
import { IndicatorFilters } from '@/components/strategy/indicator-filters'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { IndicatorsTable } from '@/components/strategy/indicators-table'
import { Suspense } from 'react'

type IndicatorWithCobra = IndicatorRow & {
  cobraGreen: number | null
  cobraRed:   number | null
  testCount:  number
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

  const { supabase, user } = await getAuthUser()

  const settings = await getSettings(user!.id)
  const defaultAssetClass = (settings.default_asset_class as string) ?? 'major'
  const defaultTimeframe  = (settings.default_timeframe  as string) ?? ''

  const indicators = await getIndicators(supabase, user!.id, {
    type: filterType, author: filterAuthor, onlyAllowed,
  })

  // Load performance entries for these indicators
  const perfs = await getPerformanceForIndicators(supabase, indicators.map(i => i.id))

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

  // Merge cobra scores
  const enriched: IndicatorWithCobra[] = indicators.map(i => ({
    ...i,
    cobraGreen: cobraMap.get(i.id)?.green ?? null,
    cobraRed:   cobraMap.get(i.id)?.red   ?? null,
    testCount:  cobraMap.get(i.id)?.count ?? 0,
  }))

  // Unique filter options (from unfiltered data for better UX — load all)
  const allIndicators = await getIndicatorFilterOptions(supabase, user!.id)

  const allTypes   = [...new Set(allIndicators.map(i => i.type))].sort()
  const allAuthors = [...new Set(allIndicators.map(i => i.author))].sort()

  const forbiddenCount = enriched.filter(i => i.is_forbidden).length
  const repaintsCount  = enriched.filter(i => i.repaints).length

  return (
    <div className="p-4 sm:p-8 space-y-6">
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
        <div className="flex items-center gap-2">
          <IndicatorImportDialog />
          <IndicatorExportDialog />
          <AddIndicatorDialog />
        </div>
      </div>

      {/* Filters + Table — der Provider quittiert die Auswahl sofort und blendet die
          Tabelle ab, bis der Server die gefilterte Liste geliefert hat. */}
      <Suspense>
        <UrlFiltersProvider replace>
          <div className="space-y-6">
            <IndicatorFilters types={allTypes} authors={allAuthors} />

            <FilterPending>
              {enriched.length === 0 ? (
                <EmptyState />
              ) : (
                <IndicatorsTable
                  rows={enriched}
                  perfs={perfs}
                  defaultAssetClass={defaultAssetClass}
                  defaultTimeframe={defaultTimeframe}
                />
              )}
            </FilterPending>
          </div>
        </UrlFiltersProvider>
      </Suspense>
    </div>
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
