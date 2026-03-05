import { createClient } from '@/lib/supabase/server'
import { PortfolioOverview, type AssetWithPrice } from '@/components/crypto/portfolio-overview'
import { getStrategySignals, getPortfolioAllocations } from '@/app/(dashboard)/crypto/actions'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'

export default async function CryptoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: rawAssets },
    { data: snapshots },
    signals,
    allocations,
  ] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .in('type', ['crypto', 'stable', 'fiat'])
      .eq('user_id', user!.id)
      .order('name'),
    supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, portfolio_name, value_eur')
      .eq('user_id', user!.id)
      .gte('snapshot_date', (() => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        return d.toISOString().split('T')[0]
      })())
      .order('snapshot_date'),
    getStrategySignals(user!.id),
    getPortfolioAllocations(user!.id),
  ])

  const assetIds = (rawAssets ?? []).map(a => a.id)

  const { data: rawValuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('*')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] }

  // Latest valuation per asset (first match wins due to ordering)
  const latestMap = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
  for (const v of rawValuations ?? []) {
    if (!latestMap.has(v.asset_id)) {
      latestMap.set(v.asset_id, {
        price_per_unit: v.price_per_unit,
        total_value:    v.total_value,
        valuation_date: v.valuation_date,
      })
    }
  }

  const assets: AssetWithPrice[] = (rawAssets ?? []).map(a => {
    const val = latestMap.get(a.id)
    return {
      ...a,
      current_price: val?.price_per_unit ?? null,
      current_value: val?.total_value    ?? null,
      last_updated:  val?.valuation_date ?? null,
    }
  })

  const totalValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)

  const rebalancingResult = calculateRebalancing(signals, allocations, assets, totalValue)

  return (
    <PortfolioOverview
      initialAssets={assets}
      snapshots={snapshots ?? []}
      rebalancingRows={rebalancingResult.rows}
    />
  )
}
