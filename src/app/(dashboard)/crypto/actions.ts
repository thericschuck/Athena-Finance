'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AssetActionState = { error: string } | { success: true } | null

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createAsset(
  _prev: AssetActionState,
  formData: FormData
): Promise<AssetActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name     = (formData.get('name') as string)?.trim()
  const symbol   = (formData.get('symbol') as string)?.trim().toLowerCase()
  const quantity = parseFloat(formData.get('quantity') as string)

  if (!name)                              return { error: 'Name ist erforderlich' }
  if (!symbol)                            return { error: 'CoinGecko-ID ist erforderlich' }
  if (isNaN(quantity) || quantity <= 0)   return { error: 'Menge muss größer als 0 sein' }

  const { error } = await supabase.from('assets').insert({
    name,
    symbol,
    quantity,
    type: 'crypto',
    currency: 'EUR',
    user_id: user.id,
    portfolio_name:  (formData.get('portfolio_name') as string) || null,
    avg_buy_price:   formData.get('avg_buy_price') ? parseFloat(formData.get('avg_buy_price') as string) : null,
    exchange:        (formData.get('exchange') as string) || null,
    notes:           (formData.get('notes') as string) || null,
  })

  if (error) return { error: error.message }
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

  const id       = formData.get('id') as string
  const name     = (formData.get('name') as string)?.trim()
  const symbol   = (formData.get('symbol') as string)?.trim().toLowerCase()
  const quantity = parseFloat(formData.get('quantity') as string)

  if (!id)                                return { error: 'ID fehlt' }
  if (!name)                              return { error: 'Name ist erforderlich' }
  if (!symbol)                            return { error: 'CoinGecko-ID ist erforderlich' }
  if (isNaN(quantity) || quantity <= 0)   return { error: 'Menge muss größer als 0 sein' }

  const { error } = await supabase
    .from('assets')
    .update({
      name,
      symbol,
      quantity,
      portfolio_name:  (formData.get('portfolio_name') as string) || null,
      avg_buy_price:   formData.get('avg_buy_price') ? parseFloat(formData.get('avg_buy_price') as string) : null,
      exchange:        (formData.get('exchange') as string) || null,
      notes:           (formData.get('notes') as string) || null,
      updated_at:      new Date().toISOString(),
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

// ─── Refresh prices via CoinGecko ─────────────────────────────────────────────
export async function refreshPrices(): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { data: assets } = await supabase
    .from('assets')
    .select('id, symbol, quantity, portfolio_name')
    .eq('type', 'crypto')
    .eq('user_id', user.id)
    .not('symbol', 'is', null)

  if (!assets?.length) return { error: 'Keine Crypto-Assets mit Coin-ID gefunden' }

  const coinIds = [...new Set(assets.map(a => a.symbol!.toLowerCase()))].join(',')

  let prices: Record<string, { eur: number }>
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=eur`,
      { cache: 'no-store' }
    )
    if (!res.ok) return { error: `CoinGecko: ${res.status} ${res.statusText}` }
    prices = await res.json()
  } catch {
    return { error: 'CoinGecko API nicht erreichbar' }
  }

  const today = new Date().toISOString().split('T')[0]

  const matched = assets.filter(a => prices[a.symbol!.toLowerCase()]?.eur != null)

  if (matched.length === 0)
    return { error: 'Keine Preise erhalten. Prüfe die CoinGecko-IDs (z.B. "bitcoin", "ethereum").' }

  const valuationInserts = matched.map(a => ({
    asset_id:       a.id,
    price_per_unit: prices[a.symbol!.toLowerCase()].eur,
    total_value:    (a.quantity ?? 0) * prices[a.symbol!.toLowerCase()].eur,
    valuation_date: today,
    source:         'coingecko',
  }))

  const snapshotInserts = matched.map(a => ({
    asset_id:       a.id,
    portfolio_name: a.portfolio_name,
    price_eur:      prices[a.symbol!.toLowerCase()].eur,
    quantity:       a.quantity ?? 0,
    snapshot_date:  today,
    source:         'manual',
    user_id:        user.id,
  }))

  const ids = matched.map(a => a.id)

  // Remove today's existing entries first to avoid duplicates
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
