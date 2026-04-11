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
import { FIAT_EUR_PRICES, findBySymbol } from '@/lib/crypto/coin-registry'
import { decrypt } from '@/lib/encryption'
import { fetchKrakenBalances, krakenCodeToSymbol } from '@/lib/kraken'
import type { ExchangeKeyRow } from '@/types/exchange-keys'

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

  // Audit log (table not yet in generated types → cast)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('asset_audit_log').insert({
    user_id:      user.id,
    asset_id:     asset.id,
    asset_name:   name,
    asset_symbol: coingeckoId,
    action:       'created',
    changes: {
      quantity:      quantity,
      avg_buy_price: avgBuyPrice,
      portfolio_name: (formData.get('portfolio_name') as string) || null,
      exchange:       (formData.get('exchange') as string) || null,
    },
  })

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

  // Fetch current values for diff
  const { data: current } = await supabase
    .from('assets')
    .select('name, symbol, quantity, avg_buy_price, portfolio_name, exchange, notes')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const newAvgBuyPrice  = formData.get('avg_buy_price') ? parseFloat(formData.get('avg_buy_price') as string) : null
  const newPortfolio    = (formData.get('portfolio_name') as string) || null
  const newExchange     = (formData.get('exchange') as string) || null
  const newNotes        = (formData.get('notes') as string) || null

  const { error } = await supabase
    .from('assets')
    .update({
      name,
      symbol:         coingeckoId,
      quantity,
      portfolio_name: newPortfolio,
      avg_buy_price:  newAvgBuyPrice,
      exchange:       newExchange,
      notes:          newNotes,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Audit log — only record changed fields
  if (current) {
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (current.quantity      !== quantity)        changes.quantity      = { from: current.quantity,      to: quantity }
    if (current.avg_buy_price !== newAvgBuyPrice)  changes.avg_buy_price = { from: current.avg_buy_price, to: newAvgBuyPrice }
    if (current.portfolio_name !== newPortfolio)   changes.portfolio_name = { from: current.portfolio_name, to: newPortfolio }
    if (current.exchange       !== newExchange)    changes.exchange       = { from: current.exchange,       to: newExchange }
    if (current.name           !== name)           changes.name           = { from: current.name,           to: name }
    if (current.notes          !== newNotes)       changes.notes          = { from: current.notes,          to: newNotes }

    if (Object.keys(changes).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('asset_audit_log').insert({
        user_id:      user.id,
        asset_id:     id,
        asset_name:   name,
        asset_symbol: coingeckoId,
        action:       'updated',
        changes,
      })
    }
  }

  revalidatePath('/crypto')
  return { success: true }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteAsset(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  // Fetch before delete for audit log
  const { data: current } = await supabase
    .from('assets')
    .select('name, symbol, quantity, avg_buy_price, portfolio_name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  if (current) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('asset_audit_log').insert({
      user_id:      user.id,
      asset_id:     null,
      asset_name:   current.name,
      asset_symbol: current.symbol ?? '',
      action:       'deleted',
      changes: {
        quantity:      current.quantity,
        avg_buy_price: current.avg_buy_price,
        portfolio_name: current.portfolio_name,
      },
    })
  }

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

  const ids = matched.map(a => a.id)

  await supabase.from('asset_valuations').delete().in('asset_id', ids).eq('valuation_date', today)

  const { error: e1 } = await supabase.from('asset_valuations').insert(valuationInserts)

  if (e1) return { error: e1.message }

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

// ─── Crypto Portfolio Source ──────────────────────────────────────────────────
export type CryptoSource = 'all' | 'kraken' | 'manual'

export async function saveCryptoSource(source: CryptoSource): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('user_settings').upsert(
    { user_id: user.id, key: 'crypto_source', value: source as unknown as Json },
    { onConflict: 'user_id,key' }
  )
  revalidatePath('/crypto')
}

export async function getCryptoSource(userId: string): Promise<CryptoSource> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'crypto_source')
    .maybeSingle()
  const v = data?.value as string | undefined
  return (v === 'kraken' || v === 'manual') ? v : 'all'
}

// ─── Kraken Sync ──────────────────────────────────────────────────────────────
export type SyncState = { error: string } | { success: true; synced: number } | null

export async function syncFromKraken(): Promise<SyncState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  // 1. Load + decrypt Kraken credentials
  // exchange_keys not in generated types yet — remove cast after `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: keyRow } = await (supabase as any)
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', user.id)
    .eq('exchange', 'kraken')
    .maybeSingle() as { data: Pick<ExchangeKeyRow, 'api_key' | 'api_secret'> | null }

  if (!keyRow) return { error: 'Kein Kraken-Konto verbunden. Bitte erst unter Einstellungen → Integrationen verbinden.' }

  let apiKey: string, apiSecret: string
  try {
    apiKey    = decrypt(keyRow.api_key)
    apiSecret = decrypt(keyRow.api_secret)
  } catch (e) {
    return { error: `Entschlüsselung fehlgeschlagen: ${(e as Error).message}` }
  }

  // 2. Fetch balances from Kraken
  let raw: Record<string, string>
  try {
    raw = await fetchKrakenBalances(apiKey, apiSecret)
  } catch (e) {
    return { error: `Kraken API Fehler: ${(e as Error).message}` }
  }

  // 3. Map codes → CoinGecko IDs, skip fiat + unknown
  type SyncEntry = { symbol: string; name: string; type: string; quantity: number }
  const candidates: SyncEntry[] = []

  for (const [code, amountStr] of Object.entries(raw)) {
    const quantity = parseFloat(amountStr)
    if (quantity <= 0) continue

    const tradingSymbol = krakenCodeToSymbol(code)
    const coin = findBySymbol(tradingSymbol)
    if (!coin || !coin.coingecko_id) continue  // skip fiat + unknown

    candidates.push({ symbol: coin.coingecko_id, name: coin.name, type: coin.type, quantity })
  }

  if (candidates.length === 0) return { error: 'Keine bekannten Krypto-Assets im Kraken-Konto gefunden.' }

  // 4. Fetch prices first — needed to filter out dust (< 1 €)
  const prices = await getPrices(candidates.map(e => e.symbol)).catch(() => ({} as Record<string, number>))
  const today  = new Date().toISOString().split('T')[0]

  // Keep only assets worth ≥ 1 € (or price unknown — keep to be safe)
  const MIN_EUR_VALUE = 1
  const toSync = candidates.filter(e => {
    const price = prices[e.symbol]
    if (price == null) return true               // unknown price → keep
    return e.quantity * price >= MIN_EUR_VALUE
  })

  if (toSync.length === 0) return { error: 'Keine Assets mit ausreichendem Wert im Kraken-Konto gefunden (minimum 1 €).' }

  // 5. Load existing Kraken-sourced assets for this user
  const { data: existingAssets } = await supabase
    .from('assets')
    .select('id, symbol, quantity, portfolio_name')
    .eq('user_id', user.id)
    .eq('exchange', 'Kraken')

  const existingMap = new Map<string, { id: string; portfolio_name: string | null }>(
    (existingAssets ?? []).filter(a => a.symbol != null).map(a => [a.symbol!, { id: a.id, portfolio_name: a.portfolio_name }])
  )
  const syncedSymbols = new Set(toSync.map(e => e.symbol))

  // 6. Upsert: update existing, insert new
  for (const entry of toSync) {
    const existing = existingMap.get(entry.symbol)
    if (existing) {
      await supabase.from('assets').update({
        quantity:       entry.quantity,
        portfolio_name: 'Kraken',
        updated_at:     new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('assets').insert({
        user_id:        user.id,
        name:           entry.name,
        symbol:         entry.symbol,
        type:           entry.type,
        quantity:       entry.quantity,
        currency:       'EUR',
        exchange:       'Kraken',
        portfolio_name: 'Kraken',
      })
    }
  }

  // 7. Remove assets that are no longer in balance OR now below the dust threshold
  const staleIds = (existingAssets ?? [])
    .filter(a => a.symbol == null || !syncedSymbols.has(a.symbol))
    .map(a => a.id)

  if (staleIds.length > 0) {
    await supabase.from('assets').delete().in('id', staleIds)
  }

  // 8. Write fresh valuations (prices already fetched above)
  const { data: freshAssets } = await supabase
    .from('assets')
    .select('id, symbol, quantity')
    .eq('user_id', user.id)
    .eq('exchange', 'Kraken')

  for (const asset of freshAssets ?? []) {
    if (!asset.symbol) continue
    const price = prices[asset.symbol]
    if (price == null) continue
    // Delete ALL existing valuations (prevents stale totals from old quantities)
    await supabase.from('asset_valuations').delete().eq('asset_id', asset.id)
    await supabase.from('asset_valuations').insert({
      asset_id:       asset.id,
      price_per_unit: price,
      total_value:    (asset.quantity ?? 0) * price,
      valuation_date: today,
      source:         'coingecko',
    })
  }

  // 9. Save last sync timestamp
  await supabase.from('user_settings').upsert(
    { user_id: user.id, key: 'kraken_last_sync', value: new Date().toISOString() as unknown as Json },
    { onConflict: 'user_id,key' }
  )

  revalidatePath('/crypto')
  return { success: true, synced: toSync.length }
}

// ─── Portfolio Management ─────────────────────────────────────────────────────

/** Delete all assets belonging to a manual portfolio (by portfolio_name). */
export async function deletePortfolio(portfolioName: string): Promise<{ error: string } | { success: true }> {
  if (!portfolioName || portfolioName === 'Kraken') return { error: 'Ungültiger Portfolio-Name' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('user_id', user.id)
    .eq('portfolio_name', portfolioName)

  if (error) return { error: error.message }

  revalidatePath('/crypto')
  return { success: true }
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
