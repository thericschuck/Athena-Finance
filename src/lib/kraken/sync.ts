/**
 * Kraken-Spot-Sync — Kernlogik, bewusst ohne Next.js-Bindung.
 *
 * Liegt hier statt in `crypto/actions.ts`, weil sie von zwei Stellen laeuft:
 *   • der Server Action `syncFromKraken()` (Button "Jetzt synchronisieren")
 *   • dem Cron `/api/cron/kraken-sync` (alle 6 Stunden, Service-Role, kein Login)
 * Deshalb bekommt sie den Supabase-Client und die User-ID hereingereicht und ruft weder
 * `auth.getUser()` noch `revalidatePath()` auf.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPrices } from '@/lib/crypto/coingecko'
import type { Database, Json } from '@/types/database'
import { FIAT_EUR_PRICES, findBySymbol } from '@/lib/crypto/coin-registry'
import { decrypt } from '@/lib/encryption'
import {
  fetchKrakenBalances,
  fetchKrakenAssetInfo,
  fetchKrakenAssetPairs,
  fetchKrakenTradesHistory,
  buildKrakenPriceMap,
  krakenCodeToSymbol,
  KRAKEN_TO_SYMBOL,
  type KrakenAssetPair,
} from '@/lib/kraken'
import { computeAverageCostBasis, type NormalizedTrade } from '@/lib/kraken/cost-basis'

export type KrakenSyncResult =
  | { error: string }
  | { success: true; synced: number; warnings: string[] }

export async function syncKrakenForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<KrakenSyncResult> {
  // 1. Load + decrypt Kraken credentials
  const { data: keyRow } = await supabase
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', userId)
    .eq('exchange', 'kraken')
    .maybeSingle()

  if (!keyRow) return { error: 'Kein Kraken-Konto verbunden. Bitte erst unter Einstellungen → Integrationen verbinden.' }

  let apiKey: string, apiSecret: string
  try {
    apiKey    = decrypt(keyRow.api_key)
    apiSecret = decrypt(keyRow.api_secret)
  } catch (e) {
    return { error: `Entschlüsselung fehlgeschlagen: ${(e as Error).message}` }
  }

  // 2. Fetch balances from Kraken — every nonzero holding, no whitelist. What Kraken shows
  // you is what ends up here, including fiat cash and staked positions.
  let raw: Record<string, string>
  try {
    raw = await fetchKrakenBalances(apiKey, apiSecret)
  } catch (e) {
    return { error: `Kraken API Fehler: ${(e as Error).message}` }
  }

  // Kraken fuehrt Staking-, Earn- und Opt-in-Rewards-Guthaben als eigene Codes mit Suffix:
  // `SOL.S` (staked), `USDG.F` (Earn flexible), `XXBT.M` (opt-in rewards), `.B` (bonded),
  // `.P`. Fuer keinen davon existiert ein Kraken-Handelspaar oder ein Registry-Eintrag — sie
  // kaemen als eigene, dauerhaft mit 0 bewertete Zeilen neben dem Basis-Coin an. Deshalb
  // werden sie auf den Basis-Code aufaddiert: 1 SOL + 3 SOL.S sind in der Uebersicht 4 SOL.
  const byBaseCode = new Map<string, number>()
  for (const [code, amountStr] of Object.entries(raw)) {
    const quantity = parseFloat(amountStr)
    if (!(quantity > 0)) continue
    const base = code.replace(/\.(S|M|F|B|P)$/i, '')
    byBaseCode.set(base, (byBaseCode.get(base) ?? 0) + quantity)
  }
  const held = [...byBaseCode].map(([code, quantity]) => ({ code, quantity }))

  if (held.length === 0) return { error: 'Keine Guthaben im Kraken-Konto gefunden.' }

  const warnings: string[] = []

  // 3. Resolve display symbols — the curated legacy map wins for the handful of codes in it
  // (Kraken's API calls Bitcoin "XBT", which nobody using Kraken's own UI ever sees as such),
  // else Kraken's own /Assets endpoint (its `altname`), else the last-resort prefix-stripping
  // heuristic. The coin-registry is only consulted as a best-effort enrichment (nicer display
  // name, stablecoin classification, a CoinGecko id to fall back to) — nothing is dropped if
  // it's not in it.
  let assetInfo: Record<string, { altname: string }> = {}
  try {
    assetInfo = await fetchKrakenAssetInfo()
  } catch {
    // best-effort — falls back to the static heuristic per code below
  }

  type Entry = {
    code: string; symbol: string; dbSymbol: string; name: string; type: string
    quantity: number; coingeckoId: string | null
  }
  const entries: Entry[] = held.map(({ code, quantity }) => {
    const symbol = KRAKEN_TO_SYMBOL[code] ?? assetInfo[code]?.altname ?? krakenCodeToSymbol(code)
    const isFiat = code.startsWith('Z') && code.length <= 5
    const registryMatch = findBySymbol(symbol)
    return {
      code,
      symbol,
      // The DB `symbol` column doubles as this app's "which coin is this" key everywhere
      // outside this sync — rebalancing targets, the portfolio donut, and the generic
      // CoinGecko price-refresh button all match assets by treating `symbol` as a CoinGecko
      // id (see e.g. src/lib/crypto/rebalancing.ts:90-141, `a.symbol.toLowerCase()` compared
      // against `coingecko_id`). Storing Kraken's own ticker there instead would silently
      // break all of that for every well-known coin — so this uses the registry's
      // coingecko_id whenever one is found, and only falls back to Kraken's ticker for coins
      // with no registry match at all (where there's no existing convention to stay
      // compatible with anyway).
      dbSymbol:    registryMatch?.coingecko_id ?? symbol,
      name:        registryMatch?.name ?? symbol,
      type:        isFiat ? 'fiat' : (registryMatch?.type === 'stable' ? 'stable' : 'crypto'),
      quantity,
      coingeckoId: registryMatch?.coingecko_id ?? null,
    }
  })

  // 4. Price everything — Kraken's own ticker first (EUR pair, else USD pair converted via
  // Kraken's own EUR/USD rate), CoinGecko only for whatever Kraken itself can't price.
  let assetPairs: Record<string, KrakenAssetPair> = {}
  try {
    assetPairs = await fetchKrakenAssetPairs()
  } catch {
    // best-effort — every code falls through to the CoinGecko fallback below
  }

  const codesToPrice = entries.filter(e => e.code !== 'ZEUR').map(e => e.code)
  const { pricesEur: krakenPrices, unresolved, usdPerEur } =
    await buildKrakenPriceMap(codesToPrice, assetPairs).catch(() => ({
      pricesEur: {} as Record<string, number>, unresolved: codesToPrice, usdPerEur: 1,
    }))

  const fallbackIds = [...new Set(
    entries.filter(e => unresolved.includes(e.code) && e.coingeckoId).map(e => e.coingeckoId!)
  )]
  const coingeckoPrices = fallbackIds.length > 0
    ? await getPrices(fallbackIds).catch(() => ({} as Record<string, number>))
    : {}

  const priced = entries.map(e => {
    if (e.code === 'ZEUR') return { ...e, priceEur: 1, priceSource: 'kraken' as const }
    if (krakenPrices[e.code] != null) return { ...e, priceEur: krakenPrices[e.code], priceSource: 'kraken' as const }
    if (e.coingeckoId && coingeckoPrices[e.coingeckoId] != null) {
      return { ...e, priceEur: coingeckoPrices[e.coingeckoId], priceSource: 'coingecko' as const }
    }
    // Last-resort static fiat approximation — the same table manual fiat assets already use.
    const staticFiat = e.type === 'fiat' ? FIAT_EUR_PRICES[e.symbol.toLowerCase()] : undefined
    if (staticFiat != null) return { ...e, priceEur: staticFiat, priceSource: 'coingecko' as const }
    return { ...e, priceEur: null as number | null, priceSource: 'kraken' as const }
  })

  const unpriced = priced.filter(e => e.priceEur == null)
  if (unpriced.length > 0) {
    warnings.push(`Kein Preis gefunden für: ${unpriced.map(e => e.symbol).join(', ')}`)
  }

  // 5. Trade history → average cost basis in EUR. Best-effort: a Kraken API hiccup here
  // shouldn't fail the whole sync, it just means avg_buy_price stays whatever it already was.
  let avgCostByCode = new Map<string, number | null>()
  try {
    const trades = await fetchKrakenTradesHistory(apiKey, apiSecret)
    const normalized: NormalizedTrade[] = []
    let skippedNonFiatQuote = 0
    for (const t of trades) {
      const pairInfo = assetPairs[t.pair]
      if (!pairInfo) continue
      const price = parseFloat(t.price), cost = parseFloat(t.cost), vol = parseFloat(t.vol)
      if ([price, cost, vol].some(Number.isNaN)) continue

      let costEur: number | null = null
      if (pairInfo.quote === 'ZEUR') costEur = cost
      else if (pairInfo.quote === 'ZUSD') costEur = cost / usdPerEur
      // Crypto-quoted trades (e.g. ETH/BTC) have no direct EUR cost — excluded from the
      // average on purpose, see cost-basis.ts's module comment.
      if (costEur == null) { skippedNonFiatQuote++; continue }

      normalized.push({ code: pairInfo.base, type: t.type, volume: vol, costEur, time: t.time })
    }
    if (trades.length > 0 && normalized.length === 0) {
      warnings.push(
        skippedNonFiatQuote === trades.length
          ? 'Einstandspreise nicht berechnet: alle Trades liefen gegen andere Kryptowährungen, nicht EUR/USD.'
          : 'Einstandspreise nicht berechnet: Handelspaare konnten nicht zugeordnet werden.'
      )
    }
    avgCostByCode = computeAverageCostBasis(normalized)
  } catch (e) {
    // Trade history is best-effort — sync still succeeds without fresh cost-basis data —
    // but a permission error (missing "Query Closed Orders & Trades" API-key scope) is the
    // single most likely reason avg_buy_price never gets filled, so surface it instead of
    // silently leaving every asset without a cost basis.
    warnings.push(`Einstandspreise nicht abrufbar (Kraken-API-Key-Berechtigung prüfen): ${(e as Error).message}`)
  }

  // 6. Upsert into `assets` — real DB upsert via the (user_id, exchange, symbol) unique
  // constraint instead of a manual select-then-branch. Split into two batches so an asset
  // with no fresh cost-basis data this run doesn't have its (possibly manually-set)
  // avg_buy_price overwritten with null — a batch simply omitting the column never touches it.
  const nowIso = new Date().toISOString()
  const baseRow = (e: typeof priced[number]) => ({
    user_id:        userId,
    name:           e.name,
    symbol:         e.dbSymbol,
    type:           e.type,
    quantity:       e.quantity,
    currency:       'EUR',
    exchange:       'Kraken',
    portfolio_name: 'Kraken',
    // Markiert die Zeile als Spiegel des Exchange-Bestands. Nur solche Zeilen darf der
    // Prune-Schritt unten anfassen — manuell gepflegte Assets im selben Portfolio bleiben
    // stehen. Ohne das hat der erste echte Sync am 29.08.2026 463 EUR manuellen Bestand
    // geloescht, weil Kraken selbst nur noch Staub hielt.
    source:         'kraken',
    updated_at:     nowIso,
  })

  type Row = ReturnType<typeof baseRow> & { avg_buy_price?: number }
  const withCostBasis:    Row[] = []
  const withoutCostBasis: Row[] = []
  for (const e of priced) {
    const avg = avgCostByCode.get(e.code)
    if (avg != null) withCostBasis.push({ ...baseRow(e), avg_buy_price: avg })
    else withoutCostBasis.push(baseRow(e))
  }

  if (withCostBasis.length > 0) {
    const { error } = await supabase.from('assets').upsert(withCostBasis, { onConflict: 'user_id,exchange,symbol' })
    if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` }
  }
  if (withoutCostBasis.length > 0) {
    const { error } = await supabase.from('assets').upsert(withoutCostBasis, { onConflict: 'user_id,exchange,symbol' })
    if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` }
  }

  // 7. Prune Kraken assets no longer held, and collect ids for the fresh valuations below.
  const syncedSymbols = new Set(priced.map(e => e.dbSymbol))
  const { data: currentKrakenAssets } = await supabase
    .from('assets')
    .select('id, symbol, quantity')
    .eq('user_id', userId)
    .eq('exchange', 'Kraken')
    .eq('source', 'kraken')

  const staleIds = (currentKrakenAssets ?? [])
    .filter(a => !a.symbol || !syncedSymbols.has(a.symbol))
    .map(a => a.id)
  if (staleIds.length > 0) {
    await supabase.from('assets').delete().in('id', staleIds)
  }

  // 8. Fresh valuations — real upsert via the (asset_id, valuation_date) constraint, so
  // history accumulates day over day instead of being wiped on every sync.
  const priceBySymbol = new Map(priced.filter(e => e.priceEur != null).map(e => [e.dbSymbol, e]))
  const today = nowIso.split('T')[0]
  const valuationRows = (currentKrakenAssets ?? [])
    .filter(a => a.symbol && !staleIds.includes(a.id) && priceBySymbol.has(a.symbol))
    .map(a => {
      const info = priceBySymbol.get(a.symbol!)!
      return {
        asset_id:       a.id,
        price_per_unit: info.priceEur!,
        total_value:    (a.quantity ?? 0) * info.priceEur!,
        valuation_date: today,
        source:         info.priceSource,
      }
    })

  if (valuationRows.length > 0) {
    await supabase.from('asset_valuations').upsert(valuationRows, { onConflict: 'asset_id,valuation_date' })
  }

  // 9. Save last sync timestamp
  await supabase.from('user_settings').upsert(
    { user_id: userId, key: 'kraken_last_sync', value: nowIso as unknown as Json },
    { onConflict: 'user_id,key' }
  )

  return { success: true, synced: priced.length, warnings }
}
