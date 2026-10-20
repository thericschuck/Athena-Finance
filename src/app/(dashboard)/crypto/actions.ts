'use server'

import { getUserSettingValue } from '@/lib/data/crypto'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optMoneyField, moneyField } from '@/lib/api/schemas'
import { getSettings } from '@/lib/settings'
import { getPrices, getEurUsdRate } from '@/lib/crypto/coingecko'
import type { Json } from '@/types/database'
import type { RebalancingTarget } from '@/lib/crypto/rebalancing'
import { FIAT_EUR_PRICES } from '@/lib/crypto/coin-registry'
import { decrypt } from '@/lib/encryption'
import {
  fetchKrakenAssetPairs,
  fetchKrakenOpenPositions,
  fetchKrakenTradeableAssets,
  buildKrakenPriceMap,
  type KrakenAssetPair,
  type KrakenOpenPosition,
  type KrakenTradeableAsset,
} from '@/lib/kraken'
import { fetchKrakenFuturesOpenPositions, type KrakenFuturesPosition } from '@/lib/kraken/futures'
import { syncKrakenForUser } from '@/lib/kraken/sync'
import { proposeWriteAction, type ProposeWriteActionResult } from '@/lib/assistant/actions'
import { createLogger } from '@/lib/assistant/logger'

export type AssetActionState = { error: string } | { success: true } | null

const coinId = (msg: string) =>
  z.string({ error: msg }).trim().toLowerCase().min(1, msg).max(100)

const createAssetSchema = z.object({
  name: reqText('Name ist erforderlich', 100),
  coingecko_id: coinId('Bitte einen Coin auswählen'),
  // 'crypto' | 'stable' | 'fiat'; alles andere gilt wie bisher als 'crypto'
  coin_type: z.string().max(20).optional().transform(v => v || 'crypto'),
  quantity: moneyField('Menge muss größer als 0 sein').refine(n => n > 0, 'Menge muss größer als 0 sein'),
  avg_buy_price: optMoneyField('Ø Kaufpreis ist ungültig').refine(
    v => v === null || v >= 0,
    'Ø Kaufpreis darf nicht negativ sein',
  ),
  portfolio_name: optText(100),
  exchange: optText(100),
  notes: optText(2000),
})

const updateAssetSchema = z.object({
  id: idField(),
  name: reqText('Name ist erforderlich', 100),
  coingecko_id: coinId('CoinGecko-ID ist erforderlich'),
  quantity: moneyField('Menge muss größer als 0 sein').refine(n => n > 0, 'Menge muss größer als 0 sein'),
  avg_buy_price: optMoneyField('Ø Kaufpreis ist ungültig'),
  portfolio_name: optText(100),
  exchange: optText(100),
  notes: optText(2000),
})

const priceUpdateSchema = z
  .array(z.object({ id: uuid, coingecko_id: z.string().min(1).max(100) }))
  .max(500)

const rebalancingTargetsSchema = z
  .array(
    z.object({
      symbol: z.string().max(32),
      coingecko_id: z.string().max(100),
      target_pct: z.number().min(0, 'Ziel-% muss zwischen 0 und 100 liegen').max(100, 'Ziel-% muss zwischen 0 und 100 liegen'),
    }),
  )
  .max(200)

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createAsset(
  _prev: AssetActionState,
  formData: FormData
): Promise<AssetActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createAssetSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { name, coingecko_id: coingeckoId, coin_type: coinType, quantity, avg_buy_price: avgBuyPrice } = parsed.data

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
      portfolio_name: parsed.data.portfolio_name,
      exchange:       parsed.data.exchange,
      notes:          parsed.data.notes,
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Audit log
  await supabase.from('asset_audit_log').insert({
    user_id:      user.id,
    asset_id:     asset.id,
    asset_name:   name,
    asset_symbol: coingeckoId,
    action:       'created',
    changes: {
      quantity:      quantity,
      avg_buy_price: avgBuyPrice,
      portfolio_name: parsed.data.portfolio_name,
      exchange:       parsed.data.exchange,
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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateAssetSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, name, coingecko_id: coingeckoId, quantity } = parsed.data

  // Fetch current values for diff
  const { data: current } = await supabase
    .from('assets')
    .select('name, symbol, quantity, avg_buy_price, portfolio_name, exchange, notes')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const newAvgBuyPrice  = parsed.data.avg_buy_price
  const newPortfolio    = parsed.data.portfolio_name
  const newExchange     = parsed.data.exchange
  const newNotes        = parsed.data.notes

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
    const changes: { [key: string]: { from: Json; to: Json } } = {}
    if (current.quantity      !== quantity)        changes.quantity      = { from: current.quantity,      to: quantity }
    if (current.avg_buy_price !== newAvgBuyPrice)  changes.avg_buy_price = { from: current.avg_buy_price, to: newAvgBuyPrice }
    if (current.portfolio_name !== newPortfolio)   changes.portfolio_name = { from: current.portfolio_name, to: newPortfolio }
    if (current.exchange       !== newExchange)    changes.exchange       = { from: current.exchange,       to: newExchange }
    if (current.name           !== name)           changes.name           = { from: current.name,           to: name }
    if (current.notes          !== newNotes)       changes.notes          = { from: current.notes,          to: newNotes }

    if (Object.keys(changes).length > 0) {
      await supabase.from('asset_audit_log').insert({
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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

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
    await supabase.from('asset_audit_log').insert({
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
  const { supabase, user } = await getAuthUser()
  if (!user) throw new Error('Nicht eingeloggt')
  const argP = parseInput(priceUpdateSchema, assets)
  if (!argP.ok) return { updated: 0, errors: [issueMessage(argP)] }

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
  const { supabase, user } = await getAuthUser()
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

// ─── Kraken-live asset picker (for rebalancing targets) ──────────────────────
// Malik bleibt vorerst im Kraken-Ökosystem — der Picker soll deshalb genau die Assets zeigen,
// die auf Kraken tatsächlich handelbar sind, statt der statischen Registry. Öffentliche
// Kraken-Daten, aber trotzdem hinter Login (Konsistenz mit dem Rest dieser Datei).
export async function getKrakenTradeableAssets(): Promise<KrakenTradeableAsset[]> {
  const { user } = await getAuthUser()
  if (!user) return []
  return fetchKrakenTradeableAssets()
}

// ─── Rebalancing targets ──────────────────────────────────────────────────────
// Flache Liste "Asset → Ziel-%" statt des früheren Core/Adam/High-Beta-Signalsystems.
export async function getRebalancingTargets(userId: string): Promise<RebalancingTarget[]> {
  // getSettings() ist React-cache()-dedupliziert: liest ein Aufrufer im selben
  // Request bereits alle Settings (z.B. das Dashboard-Layout), kostet das hier
  // keinen weiteren DB-Roundtrip statt einer eigenen user_settings-Abfrage.
  const settings = await getSettings(userId)
  const value = settings.rebalancing_targets
  if (!value) return []
  return value as unknown as RebalancingTarget[]
}

export async function saveRebalancingTargets(targets: RebalancingTarget[]): Promise<void> {
  const { supabase, user } = await getAuthUser()
  if (!user) throw new Error('Nicht eingeloggt')
  const argP = parseInput(rebalancingTargetsSchema, targets)
  if (!argP.ok) throw new Error(issueMessage(argP))

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key:     'rebalancing_targets',
      value:   targets as unknown as Json,
    },
    { onConflict: 'user_id,key' }
  )

  if (error) throw new Error(error.message)
  revalidatePath('/crypto/rebalancing')
  revalidatePath('/crypto')
}

// ─── Last rebalancing ─────────────────────────────────────────────────────────
export async function getLastRebalancing(userId: string): Promise<string | null> {
  const settings = await getSettings(userId)
  const value = settings.last_rebalancing
  if (!value) return null
  return value as unknown as string
}

// ─── Crypto Portfolio Source ──────────────────────────────────────────────────
export type CryptoSource = 'all' | 'kraken' | 'manual'

export async function saveCryptoSource(source: CryptoSource): Promise<void> {
  const { supabase, user } = await getAuthUser()
  if (!user) return
  if (!parseInput(z.enum(['all', 'kraken', 'manual']), source).ok) return

  await supabase.from('user_settings').upsert(
    { user_id: user.id, key: 'crypto_source', value: source as unknown as Json },
    { onConflict: 'user_id,key' }
  )
  revalidatePath('/crypto')
}

export async function getCryptoSource(userId: string): Promise<CryptoSource> {
  const supabase = await createClient()
  const v = (await getUserSettingValue(supabase, userId, 'crypto_source')) as string | null
  return (v === 'kraken' || v === 'manual') ? v : 'all'
}

// ─── Kraken Sync ──────────────────────────────────────────────────────────────
export type SyncState =
  | { error: string }
  | { success: true; synced: number; warnings: string[] }
  | null

export async function syncFromKraken(): Promise<SyncState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const result = await syncKrakenForUser(supabase, user.id)
  if ('success' in result) revalidatePath('/crypto')
  return result
}

// ─── Rebalancing: Ausführung vorschlagen (Button außerhalb des Chats) ──────────
// Ruft dieselbe WRITE_ACTION auf, die Athena im Chat vorschlagen würde
// (`executeRebalancing` in src/lib/assistant/actions/crypto.ts) über `proposeWriteAction` — der Button
// auf der Rebalancing-Seite nimmt damit exakt denselben Vorschlags-/Bestätigungsweg wie der
// Chat, inklusive derselben PendingActionCard. Kein eigener zweiter Ausführungspfad.
export async function proposeRebalanceExecution(): Promise<ProposeWriteActionResult> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  return proposeWriteAction(
    'executeRebalancing',
    {},
    { supabase, userId: user.id },
    { logger: createLogger(supabase, user.id, null) },
  )
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
  const { supabase, user } = await getAuthUser()
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
  if (!parseInput(z.string().trim().min(1).max(100), portfolioName).ok || portfolioName === 'Kraken') {
    return { error: 'Ungültiger Portfolio-Name' }
  }

  const { supabase, user } = await getAuthUser()
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
  const { supabase, user } = await getAuthUser()
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
