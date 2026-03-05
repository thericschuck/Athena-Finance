import { createClient } from '@/lib/supabase/server'
import { getStrategySignals, getPortfolioAllocations, getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import { RebalancingCalculator } from '@/components/crypto/rebalancing-calculator'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'

export default async function RebalancingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user!.id

  // Load assets + latest valuations
  const { data: rawAssets } = await supabase
    .from('assets')
    .select('*')
    .eq('type', 'crypto')
    .eq('user_id', userId)
    .order('name')

  const assetIds = (rawAssets ?? []).map(a => a.id)

  const { data: rawValuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('*')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at',    { ascending: false })
    : { data: [] }

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

  // Load user settings in parallel
  const [signals, allocations, lastRebalancing] = await Promise.all([
    getStrategySignals(userId),
    getPortfolioAllocations(userId),
    getLastRebalancing(userId),
  ])

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rebalancing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Strategie-Signale setzen und Portfolio-Zielgewichtungen prüfen
        </p>
      </div>

      <RebalancingCalculator
        assets={assets}
        initialSignals={signals}
        initialAllocations={allocations}
        totalValue={totalValue}
        lastRebalancing={lastRebalancing}
      />
    </div>
  )
}
