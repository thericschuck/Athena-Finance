'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getPrices, getEurUsdRate } from '@/lib/crypto/coingecko'
import type { Json } from '@/types/database'
import {
  DEFAULT_STRATEGY_SIGNALS,
  DEFAULT_PORTFOLIO_ALLOCATIONS,
  type StrategySignals,
  type PortfolioAllocations,
} from '@/lib/crypto/rebalancing-defaults'
import { FIAT_EUR_PRICES } from '@/lib/crypto/coin-registry'
import { decrypt } from '@/lib/encryption'
import {
  fetchKrakenAssetPairs,
  fetchKrakenOpenPositions,
  buildKrakenPriceMap,
  type KrakenAssetPair,
  type KrakenOpenPosition,
} from '@/lib/kraken'
import { fetchKrakenFuturesOpenPositions, type KrakenFuturesPosition } from '@/lib/kraken/futures'
import { syncKrakenForUser } from '@/lib/kraken/sync'

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

      // Real upsert — asset_valuations has a unique (asset_id, valuation_date) constraint.
      const { error } = await supabase.from('asset_valuations').upsert({
        asset_id:       id,
        price_per_unit: price,
        total_value:    totalValue,
        valuation_date: today,
        source:         'coingecko',
      }, { onConflict: 'asset_id,valuation_date' })

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

  const { error: e1 } = await supabase
    .from('asset_valuations')
    .upsert(valuationInserts, { onConflict: 'asset_id,valuation_date' })

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
export type SyncState =
  | { error: string }
  | { success: true; synced: number; warnings: string[] }
  | null

export async function syncFromKraken(): Promise<SyncState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const result = await syncKrakenForUser(supabase, user.id)
  if ('success' in result) revalidatePath('/crypto')
  return result
}

// ─── Open Positions (margin/leveraged, read-only, not persisted) ──────────────
// Kraken keeps these entirely separate from spot Balance, and Kraken Futures positions are
// separate again from Spot-margin ones (different product, different API key). Fetched live
// on each page load (like `getEurUsdRate()`) rather than synced into `assets` — a leveraged
// position (side, margin, unrealized P&L, liquidation risk) doesn't fit the plain
// quantity/avg-price model spot holdings use, so it gets its own read-only section instead of
// a fake "asset" row.
export interface OpenPositionView {
  source:     'spot' | 'futures'
  pair:       string
  side:       'long' | 'short'
  volume:     number
  /** Positionswert / eingesetzte Margin. Kraken liefert keinen Hebelfaktor im Klartext,
   *  beide Groessen aber schon. null, wo er nicht bestimmbar ist (siehe Futures). */
  leverage:   number | null
  entryPrice: number | null
  marginEur:  number | null
  costEur:    number | null
  valueEur:   number | null
  netPnlEur:  number | null
  /** Bereits angefallene Gebuehren (Spot: Order- + Rollover-Gebuehr, Futures: Funding). */
  feeEur:     number | null
  openedAt:   string | null
}

/**
 * Woher die Positionsliste stammt — damit die Karte "es gibt keine Positionen" von
 * "danach wurde gar nicht gefragt" unterscheiden kann. Vorher gab `getFuturesPositions()`
 * bei fehlendem API-Schluessel still `[]` zurueck und die Karte meldete "keine offenen
 * gehebelten Positionen" — auch wenn welche offen waren und nur der Schluessel fehlte.
 */
export interface OpenPositionsMeta {
  spotChecked:    boolean
  futuresChecked: boolean
}

async function getDecryptedKey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exchange: string,
): Promise<{ apiKey: string; apiSecret: string } | null> {
  const { data: keyRow } = await supabase
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', userId)
    .eq('exchange', exchange)
    .maybeSingle()
  if (!keyRow) return null
  return { apiKey: decrypt(keyRow.api_key), apiSecret: decrypt(keyRow.api_secret) }
}

async function getSpotMarginPositions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ positions: OpenPositionView[]; error?: string; checked: boolean }> {
  const key = await getDecryptedKey(supabase, userId, 'kraken').catch(
    (e: Error) => ({ error: `Entschlüsselung fehlgeschlagen: ${e.message}` } as const)
  )
  if (!key) return { positions: [], checked: false }
  if ('error' in key) return { positions: [], error: key.error, checked: false }

  let rawPositions: KrakenOpenPosition[]
  try {
    rawPositions = await fetchKrakenOpenPositions(key.apiKey, key.apiSecret)
  } catch (e) {
    return { positions: [], error: `Kraken Spot API Fehler: ${(e as Error).message}`, checked: false }
  }
  if (rawPositions.length === 0) return { positions: [], checked: true }

  let assetPairs: Record<string, KrakenAssetPair> = {}
  let usdPerEur = 1
  try {
    assetPairs = await fetchKrakenAssetPairs()
    ;({ usdPerEur } = await buildKrakenPriceMap([], assetPairs))
  } catch {
    // best-effort — EUR conversion below just falls through to unavailable (null) figures
  }

  const toEur = (value: string | undefined, quote: string | undefined): number | null => {
    if (value == null) return null
    const n = parseFloat(value)
    if (isNaN(n)) return null
    if (quote === 'ZEUR') return n
    if (quote === 'ZUSD') return n / usdPerEur
    return null // quoted in something other than EUR/USD — not converted, shown as unavailable
  }

  const positions: OpenPositionView[] = rawPositions.map(p => {
    const quote  = assetPairs[p.pair]?.quote
    const cost   = parseFloat(p.cost)
    const margin = parseFloat(p.margin)
    const vol    = parseFloat(p.vol)

    return {
      source:     'spot',
      pair:       p.pair,
      side:       p.type === 'sell' ? 'short' : 'long',
      volume:     vol - parseFloat(p.vol_closed || '0'),
      // Kraken meldet `cost` (voller Positionswert bei Eroeffnung) und `margin` (davon
      // eigenes Kapital). 2x Hebel heisst margin = cost/2.
      leverage:   margin > 0 && Number.isFinite(cost) ? cost / margin : null,
      entryPrice: vol > 0 && Number.isFinite(cost) ? toEur(String(cost / vol), quote) : null,
      marginEur:  toEur(p.margin, quote),
      costEur:    toEur(p.cost, quote),
      valueEur:   toEur(p.value, quote),
      netPnlEur:  toEur(p.net, quote),
      feeEur:     toEur(p.fee, quote),
      openedAt:   p.time ? new Date(p.time * 1000).toISOString() : null,
    }
  })
  return { positions, checked: true }
}

async function getFuturesPositions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ positions: OpenPositionView[]; error?: string; checked: boolean }> {
  const key = await getDecryptedKey(supabase, userId, 'kraken_futures').catch(
    (e: Error) => ({ error: `Entschlüsselung fehlgeschlagen: ${e.message}` } as const)
  )
  if (!key) return { positions: [], checked: false }
  if ('error' in key) return { positions: [], error: key.error, checked: false }

  let rawPositions: KrakenFuturesPosition[]
  try {
    rawPositions = await fetchKrakenFuturesOpenPositions(key.apiKey, key.apiSecret)
  } catch (e) {
    return { positions: [], error: `Kraken Futures API Fehler: ${(e as Error).message}`, checked: false }
  }
  if (rawPositions.length === 0) return { positions: [], checked: true }

  // pnlCurrency is virtually always USD for Futures — EUR is not something Kraken Futures
  // itself quotes against, so this always goes through the CoinGecko-derived rate.
  const usdPerEur = await getEurUsdRate()
  const toEur = (n: number, currency: string): number | null => {
    if (currency === 'EUR') return n
    if (currency === 'USD') return n / usdPerEur
    return null
  }

  const positions: OpenPositionView[] = rawPositions.map(p => {
    const notional = p.price * p.size
    return {
      source:     'futures',
      pair:       p.symbol,
      side:       p.side,
      volume:     p.size,
      // Kraken Futures rechnet Margin standardmaessig auf Kontoebene (cross margin) —
      // `/openpositions` fuehrt zu einer einzelnen Position deshalb keine Margin. Nur bei
      // fixem Hebel steht ein Faktor drin; sonst bleibt das Feld ehrlich leer, statt eine
      // aus Kontosummen geschaetzte Zahl als Positions-Hebel auszugeben.
      leverage:   p.maxFixedLeverage ?? null,
      entryPrice: toEur(p.price, p.pnlCurrency),
      marginEur:  null,
      costEur:    toEur(notional, p.pnlCurrency),
      valueEur:   toEur(notional + p.unrealizedPnl, p.pnlCurrency),
      netPnlEur:  toEur(p.unrealizedPnl, p.pnlCurrency),
      feeEur:     toEur(-p.unrealizedFunding, p.pnlCurrency),
      openedAt:   p.fillTime ?? null,
    }
  })
  return { positions, checked: true }
}

export async function getKrakenOpenPositions(): Promise<
  { positions: OpenPositionView[]; warnings: string[]; meta: OpenPositionsMeta } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const [spot, futures] = await Promise.all([
    getSpotMarginPositions(supabase, user.id),
    getFuturesPositions(supabase, user.id),
  ])

  const warnings = [spot.error, futures.error].filter((w): w is string => !!w)
  return {
    positions: [...spot.positions, ...futures.positions],
    warnings,
    meta: { spotChecked: spot.checked, futuresChecked: futures.checked },
  }
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
