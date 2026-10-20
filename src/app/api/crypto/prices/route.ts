import { NextRequest, NextResponse } from 'next/server'
import {
  fetchKrakenAssetInfo,
  fetchKrakenAssetPairs,
  buildKrakenPriceMap,
  KRAKEN_TO_SYMBOL,
  type KrakenAssetPair,
} from '@/lib/kraken'
import { getPrices } from '@/lib/crypto/coingecko'
import { COIN_REGISTRY, FIAT_EUR_PRICES } from '@/lib/crypto/coin-registry'
import { requireUser } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/validate'
import { z } from 'zod'

const querySchema = z.object({
  ids: z.string().max(4000).optional().default(''),
})

/**
 * GET /api/crypto/prices?ids=bitcoin,ethereum,SOL
 *
 * EUR-Kurse für die Live-Anzeige im Crypto-Tab. Kraken zuerst, CoinGecko nur für das, was
 * Kraken nicht handelt.
 *
 * Warum überhaupt serverseitig: `PortfolioOverview` hat vorher alle 60 Sekunden direkt aus
 * dem Browser gegen `api.coingecko.com` gefetcht. Das lief ohne API-Key gegen das
 * IP-Rate-Limit der Free-Tier (und zwar gegen Erics eigene IP, geteilt mit jedem anderen Tab),
 * fiel bei 429 still auf die alten Werte zurück und ignorierte, dass der Kraken-Sync die
 * Kurse ohnehin schon von der Börse holt, an der die Bestände liegen. Über diese Route sind
 * es die Kraken-Kurse, ein Aufruf pro Server statt pro Browser, und ein 429 bei CoinGecko
 * betrifft nur noch die Coins, die Kraken nicht listet.
 *
 * `ids` sind die Werte aus `assets.symbol` — für Coins aus der Registry sind das
 * CoinGecko-IDs ("bitcoin"), sonst der Ticker von Kraken ("SIGMA").
 */

// ─── Kraken-Stammdaten kurz cachen ────────────────────────────────────────────
// /Assets und /AssetPairs sind statische Listen, die sich nur ändert, wenn Kraken ein neues
// Coin listet. Bei einem 60-Sekunden-Poll wären das sonst zwei überflüssige Requests pro
// Tick und Client.
const STATIC_TTL_MS = 10 * 60 * 1000
let staticCache: { at: number; assetInfo: Record<string, { altname: string }>; pairs: Record<string, KrakenAssetPair> } | null = null

async function krakenStatics() {
  if (staticCache && Date.now() - staticCache.at < STATIC_TTL_MS) return staticCache
  const [assetInfo, pairs] = await Promise.all([
    fetchKrakenAssetInfo().catch(() => ({} as Record<string, { altname: string }>)),
    fetchKrakenAssetPairs().catch(() => ({} as Record<string, KrakenAssetPair>)),
  ])
  staticCache = { at: Date.now(), assetInfo, pairs }
  return staticCache
}

/** assets.symbol → Display-Ticker ('bitcoin' → 'BTC', 'SIGMA' → 'SIGMA'). */
function toTicker(id: string): string {
  const hit = COIN_REGISTRY.find(c => c.coingecko_id === id.toLowerCase())
  return (hit?.symbol ?? id).toUpperCase()
}

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const raw = q.data.ids
  const ids = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 200)
  if (ids.length === 0) return NextResponse.json({ prices: {}, sources: {} })

  const prices:  Record<string, number> = {}
  const sources: Record<string, 'kraken' | 'coingecko' | 'fiat'> = {}

  // ── Fiat direkt, ohne Netz ──────────────────────────────────────────────────
  const remaining: string[] = []
  for (const id of ids) {
    const fiat = FIAT_EUR_PRICES[id.toLowerCase()]
    if (fiat != null) { prices[id] = fiat; sources[id] = 'fiat' }
    else remaining.push(id)
  }
  if (remaining.length === 0) return NextResponse.json({ prices, sources })

  // ── Kraken ──────────────────────────────────────────────────────────────────
  const { assetInfo, pairs } = await krakenStatics()

  // Ticker → Kraken-Code. Die kuratierte Legacy-Map gewinnt (Kraken nennt Bitcoin intern
  // "XXBT"), danach die altname-Liste aus /Assets.
  const codeByTicker = new Map<string, string>()
  for (const [code, sym] of Object.entries(KRAKEN_TO_SYMBOL)) codeByTicker.set(sym, code)
  for (const [code, info] of Object.entries(assetInfo)) {
    const alt = info.altname?.toUpperCase()
    if (alt && !codeByTicker.has(alt)) codeByTicker.set(alt, code)
  }

  const codeById = new Map<string, string>()
  for (const id of remaining) {
    const code = codeByTicker.get(toTicker(id))
    if (code) codeById.set(id, code)
  }

  if (codeById.size > 0) {
    try {
      const { pricesEur } = await buildKrakenPriceMap([...new Set(codeById.values())], pairs)
      for (const [id, code] of codeById) {
        if (pricesEur[code] != null) { prices[id] = pricesEur[code]; sources[id] = 'kraken' }
      }
    } catch {
      // Kraken nicht erreichbar — alles fällt unten auf CoinGecko zurück.
    }
  }

  // ── CoinGecko für den Rest ──────────────────────────────────────────────────
  const missing = remaining.filter(id => prices[id] == null)
  if (missing.length > 0) {
    try {
      const cg = await getPrices(missing.map(id => id.toLowerCase()))
      for (const id of missing) {
        const p = cg[id.toLowerCase()]
        if (p != null) { prices[id] = p; sources[id] = 'coingecko' }
      }
    } catch {
      // Beide Quellen aus — der Client behält seine bisherigen Werte.
    }
  }

  return NextResponse.json({ prices, sources })
}
