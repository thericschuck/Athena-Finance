'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getPrices } from '@/lib/crypto/coingecko'
import type { Json } from '@/types/database'
import {
  DEFAULT_STRATEGY_SIGNALS,
  DEFAULT_PORTFOLIO_ALLOCATIONS,
  type StrategySignals,
  type PortfolioAllocations,
} from '@/lib/crypto/rebalancing-defaults'
import { FIAT_EUR_PRICES } from '@/lib/crypto/coin-registry'

export type AssetActionState = { error: string } | { success: true } | null

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createAsset(
  _prev: AssetActionState,
  formData: FormData
): Promise<AssetActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name         = (formData.get('name') as string)?.trim()
  const coingeckoId  = (formData.get('coingecko_id') as string)?.trim().toLowerCase()
  const coinType     = (formData.get('coin_type') as string) || 'crypto'  // 'crypto' | 'stable' | 'fiat'
  const quantity     = parseFloat(formData.get('quantity') as string)
  const avgBuyPrice  = formData.get('avg_buy_price') ? parseFloat(formData.get('avg_buy_price') as string) : null

  if (!name)                              return { error: 'Name ist erforderlich' }
  if (!coingeckoId)                       return { error: 'Bitte einen Coin auswählen' }
  if (isNaN(quantity) || quantity <= 0)   return { error: 'Menge muss größer als 0 sein' }
  if (avgBuyPrice !== null && avgBuyPrice < 0) return { error: 'Ø Kaufpreis darf nicht negativ sein' }

  // Map coin_type to the DB asset type (keep 'crypto' as umbrella for all crypto-related assets)
  const assetDbType = coinType === 'fiat' ? 'fiat' : coinType === 'stable' ? 'stable' : 'crypto'

  const { data: asset, error: insertError } = await supabase
    .from('assets')
    .insert({
      name,
      symbol:        coingeckoId,
      quantity,
      type:          assetDbType,
      currency:      'EUR',
      user_id:       user.id,
      avg_buy_price: avgBuyPrice,
      portfolio_name: (formData.get('portfolio_name') as string) || null,
      exchange:       (formData.get('exchange') as string) || null,
      notes:          (formData.get('notes') as string) || null,
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Fetch/assign initial valuation
  try {
    const isFiat = coinType === 'fiat'
    const prices = isFiat
      ? { [coingeckoId]: FIAT_EUR_PRICES[coingeckoId] ?? 1 }
      : await getPrices([coingeckoId])
    const price  = prices[coingeckoId]
    if (price != null) {
      await supabase.from('asset_valuations').insert({
        asset_id:       asset.id,
        price_per_unit: price,
        total_value:    quantity * price,
        valuation_date: new Date().toISOString().split('T')[0],
        source:         isFiat ? 'manual' : 'coingecko',
      })
    }
  } catch {
    // Price fetch is best-effort — asset already created
  }

  revalidatePath('/crypto')
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateAsset(
  _prev: AssetActionState,
  formData: FormData
): Promise<AssetActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id          = formData.get('id') as string
  const name        = (formData.get('name') as string)?.trim()
  const coingeckoId = (formData.get('coingecko_id') as string)?.trim().toLowerCase()
  const quantity    = parseFloat(formData.get('quantity') as string)

  if (!id)                                return { error: 'ID fehlt' }
  if (!name)                              return { error: 'Name ist erforderlich' }
  if (!coingeckoId)                       return { error: 'CoinGecko-ID ist erforderlich' }
  if (isNaN(quantity) || quantity <= 0)   return { error: 'Menge muss größer als 0 sein' }

  const { error } = await supabase
    .from('assets')
    .update({
      name,
      symbol:         coingeckoId,
      quantity,
      portfolio_name: (formData.get('portfolio_name') as string) || null,
      avg_buy_price:  formData.get('avg_buy_price') ? parseFloat(formData.get('avg_buy_price') as string) : null,
      exchange:       (formData.get('exchange') as string) || null,
      notes:          (formData.get('notes') as string) || null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/crypto')
  return { success: true }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteAsset(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/crypto')
  return {}
}

// ─── Update prices for a list of assets ──────────────────────────────────────
export async function updateAssetPrices(
  assets: { id: string; coingecko_id: string }[]
): Promise<{ updated: number; errors: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const uniqueIds = [...new Set(assets.map(a => a.coingecko_id))]
  const prices    = await getPrices(uniqueIds)
  const today     = new Date().toISOString().split('T')[0]

  const errors: string[]   = []
  let updated               = 0

  await Promise.all(
    assets.map(async ({ id, coingecko_id }) => {
      const price = prices[coingecko_id]
      if (price == null) {
        errors.push(`Kein Preis für ${coingecko_id}`)
        return
      }

      const { data: existingAsset } = await supabase
        .from('assets')
        .select('quantity')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      const quantity    = existingAsset?.quantity ?? 0
      const totalValue  = quantity * price

      // Delete today's entry if it exists, then re-insert (UPSERT via delete+insert)
      await supabase
        .from('asset_valuations')
        .delete()
        .eq('asset_id', id)
        .eq('valuation_date', today)

      const { error } = await supabase.from('asset_valuations').insert({
        asset_id:       id,
        price_per_unit: price,
        total_value:    totalValue,
        valuation_date: today,
        source:         'coingecko',
      })

      if (error) {
        errors.push(`${coingecko_id}: ${error.message}`)
      } else {
        updated++
      }
    })
  )

  revalidatePath('/crypto')
  return { updated, errors }
}

// ─── Refresh prices via CoinGecko (full portfolio) ───────────────────────────
export async function refreshPrices(): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { data: assets } = await supabase
    .from('assets')
    .select('id, symbol, quantity, portfolio_name')
    .in('type', ['crypto', 'stable', 'fiat'])
    .eq('user_id', user.id)
    .not('symbol', 'is', null)

  if (!assets?.length) return { error: 'Keine Crypto-Assets mit Coin-ID gefunden' }

  let prices: Record<string, number>
  try {
    const coinIds = [...new Set(assets.map(a => a.symbol!.toLowerCase()))]
    prices = await getPrices(coinIds)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'CoinGecko API nicht erreichbar' }
  }

  const today   = new Date().toISOString().split('T')[0]
  const matched = assets.filter(a => prices[a.symbol!.toLowerCase()] != null)

  if (matched.length === 0)
    return { error: 'Keine Preise erhalten. Prüfe die CoinGecko-IDs (z.B. "bitcoin", "ethereum").' }

  const valuationInserts = matched.map(a => ({
    asset_id:       a.id,
    price_per_unit: prices[a.symbol!.toLowerCase()],
    total_value:    (a.quantity ?? 0) * prices[a.symbol!.toLowerCase()],
    valuation_date: today,
    source:         'coingecko',
  }))

  const snapshotInserts = matched.map(a => ({
    asset_id:       a.id,
    portfolio_name: a.portfolio_name,
    price_eur:      prices[a.symbol!.toLowerCase()],
    quantity:       a.quantity ?? 0,
    snapshot_date:  today,
    source:         'manual',
    user_id:        user.id,
  }))

  const ids = matched.map(a => a.id)

  await Promise.all([
    supabase.from('asset_valuations').delete().in('asset_id', ids).eq('valuation_date', today),
    supabase.from('portfolio_snapshots').delete().in('asset_id', ids).eq('snapshot_date', today),
  ])

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('asset_valuations').insert(valuationInserts),
    supabase.from('portfolio_snapshots').insert(snapshotInserts),
  ])

  if (e1) return { error: e1.message }
  if (e2) return { error: e2.message }

  revalidatePath('/crypto')
  return { updated: matched.length }
}

// ─── Strategy signals ─────────────────────────────────────────────────────────
export async function getStrategySignals(userId: string): Promise<StrategySignals> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'strategy_signals')
    .single()

  if (!data?.value) return DEFAULT_STRATEGY_SIGNALS
  return data.value as unknown as StrategySignals
}

export async function saveStrategySignals(signals: StrategySignals): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key:     'strategy_signals',
      value:   signals as unknown as Json,
    },
    { onConflict: 'user_id,key' }
  )

  if (error) throw new Error(error.message)
  revalidatePath('/crypto/rebalancing')
}

// ─── Portfolio allocations ────────────────────────────────────────────────────
export async function getPortfolioAllocations(userId: string): Promise<PortfolioAllocations> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'portfolio_allocations')
    .single()

  if (!data?.value) return DEFAULT_PORTFOLIO_ALLOCATIONS
  return data.value as unknown as PortfolioAllocations
}

export async function savePortfolioAllocations(allocations: PortfolioAllocations): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key:     'portfolio_allocations',
      value:   allocations as unknown as Json,
    },
    { onConflict: 'user_id,key' }
  )

  if (error) throw new Error(error.message)
  revalidatePath('/crypto/rebalancing')
}

// ─── Last rebalancing ─────────────────────────────────────────────────────────
export async function getLastRebalancing(userId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'last_rebalancing')
    .single()

  if (!data?.value) return null
  return data.value as unknown as string
}

export async function markRebalancingDone(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const today = new Date().toISOString()

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key:     'last_rebalancing',
      value:   today as unknown as Json,
    },
    { onConflict: 'user_id,key' }
  )

  if (error) throw new Error(error.message)
}
