// Deploy:   supabase functions deploy daily-snapshot
// Schedule: pg_cron job "Daily-Snapshot" — 59 23 * * * → POST /functions/v1/daily-snapshot
//
// Ablauf:
//   1. CoinGecko-Preise holen → in crypto_price_cache schreiben
//   2. Fehlende Tage der letzten 3 Tage erkennen (catch-up)
//   3. fn_take_snapshot(date) für jeden fehlenden + heutigen Tag aufrufen

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Ticker → CoinGecko-ID ────────────────────────────────────────────────────
// Nur noch ein Fallback: `assets.symbol` enthält für jeden Coin, der in der Coin-Registry
// steht, bereits die CoinGecko-ID ("bitcoin", nicht "BTC") — siehe `dbSymbol` in
// syncFromKraken(). Diese Tabelle greift für die Handvoll Assets, die manuell mit einem
// Ticker angelegt wurden.
const GECKO_IDS: Record<string, string> = {
  BTC:   'bitcoin',
  XBT:   'bitcoin',
  ETH:   'ethereum',
  SOL:   'solana',
  BNB:   'binancecoin',
  XRP:   'ripple',
  ADA:   'cardano',
  AVAX:  'avalanche-2',
  DOT:   'polkadot',
  MATIC: 'matic-network',
  LINK:  'chainlink',
  UNI:   'uniswap',
  LTC:   'litecoin',
  ATOM:  'cosmos',
  NEAR:  'near',
  FTM:   'fantom',
  ARB:   'arbitrum',
  OP:    'optimism',
  DOGE:  'dogecoin',
  SHIB:  'shiba-inu',
  USDT:  'tether',
  USDC:  'usd-coin',
  DAI:   'dai',
  PAXG:  'pax-gold',
  CRV:   'curve-dao-token',
  CVX:   'convex-finance',
  SUI:   'sui',
  PEPE:  'pepe',
  HYPE:  'hyperliquid',
  WIF:   'dogwifcoin',
}

/**
 * Kraken hängt an Staking-/Earn-Guthaben ein Suffix an (`SOL.S`, `USDG.F`, `XXBT.M`, `.B`).
 * Ohne Abschneiden findet weder CoinGecko noch die Registry etwas und die Position wird mit
 * 0 bewertet.
 */
function stripKrakenSuffix(symbol: string): string {
  return symbol.replace(/\.(S|M|F|B|P)$/i, '')
}

/** `assets.symbol` → CoinGecko-ID. Symbole SIND meist schon IDs, deshalb Registry vor Map. */
function toGeckoId(symbol: string): string {
  const bare = stripKrakenSuffix(symbol)
  return GECKO_IDS[bare.toUpperCase()] ?? bare.toLowerCase()
}

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Die Function läuft mit verify_jwt=true, die Plattform hat den Bearer also bereits
  // geprüft, bevor dieser Code überhaupt startet. Der CRON_SECRET-Check hier ist nur die
  // zweite Schranke für manuelle Aufrufe — er darf einen gültigen Supabase-JWT NICHT
  // ablehnen. Genau das hat er vorher getan: der pg_cron-Job schickt den anon-Key, nicht das
  // Secret, also lief die Function seit Monaten in einen 401 und `crypto_price_cache` blieb
  // auf dem Stand von März stehen.
  const auth   = req.headers.get('Authorization') ?? ''
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  const isJwt  = auth.startsWith('Bearer eyJ')
  if (secret && !isJwt && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url    = new URL(req.url)
  const log: string[] = []

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // ── 1. Fetch & cache CoinGecko prices ───────────────────────────────────────
  const { data: cryptoAssets } = await supabase
    .from('assets')
    .select('symbol')
    .in('type', ['crypto', 'stable'])
    .not('symbol', 'is', null)
    .gt('quantity', 0)

  // Ein Coin kann unter mehreren Schreibweisen in `assets` stehen (z.B. "SOL" manuell und
  // "solana" vom Kraken-Sync). Der Cache wird auf upper(assets.symbol) gejoint, also braucht
  // JEDE Schreibweise ihre eigene Zeile — deshalb symbol→geckoId als Paar führen.
  const bySymbol = new Map<string, string>()
  for (const a of cryptoAssets ?? []) {
    const sym = (a.symbol as string).toUpperCase()
    if (!bySymbol.has(sym)) bySymbol.set(sym, toGeckoId(a.symbol as string))
  }

  if (bySymbol.size) {
    const geckoIds = [...new Set(bySymbol.values())]
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(',')}&vs_currencies=eur`,
        { headers: { Accept: 'application/json' } },
      )
      if (res.ok) {
        const data = await res.json() as Record<string, { eur?: number }>
        const rows = [...bySymbol.entries()]
          .map(([symbol, geckoId]) => ({
            symbol,
            price_eur:  data[geckoId]?.eur ?? 0,
            updated_at: new Date().toISOString(),
          }))
          .filter(r => r.price_eur > 0)

        const missing = [...bySymbol.entries()]
          .filter(([, id]) => !(data[id]?.eur))
          .map(([sym, id]) => `${sym}→${id}`)

        if (rows.length) {
          const { error } = await supabase
            .from('crypto_price_cache')
            .upsert(rows, { onConflict: 'symbol' })
          if (error) log.push(`crypto_price_cache ERR: ${error.message}`)
          else        log.push(`crypto prices updated: ${rows.map(r => `${r.symbol}=€${r.price_eur}`).join(', ')}`)
        }
        // Fehlende Zuordnungen sind der häufigste Grund für eine 0-Bewertung — sie gehören
        // ins Log, nicht ins Schweigen.
        if (missing.length) log.push(`no CoinGecko price for: ${missing.join(', ')}`)
      } else {
        log.push(`CoinGecko HTTP ${res.status}`)
      }
    } catch (e) {
      log.push(`CoinGecko fetch failed: ${e}`)
    }
  } else {
    log.push('No crypto assets found – skipping price fetch')
  }

  // ── 2. Determine which dates to process ─────────────────────────────────────
  const dateParam = url.searchParams.get('date')
  let datesToRun: string[]

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    datesToRun = [dateParam]
    log.push(`manual backfill: ${dateParam}`)
  } else {
    const today = isoDate()
    const candidates = [1, 2, 3].map(n => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - n)
      return isoDate(d)
    })

    // Check which past days already have a snapshot
    const { data: existing } = await supabase
      .from('net_worth_snapshots')
      .select('snapshot_date')
      .in('snapshot_date', candidates)
      .limit(10)

    const existingSet = new Set((existing ?? []).map((r: { snapshot_date: string }) => r.snapshot_date))
    const missing = candidates.filter(d => !existingSet.has(d)).sort()

    if (missing.length) log.push(`catch-up: ${missing.join(', ')}`)
    datesToRun = [...missing, today]
  }

  // ── 3. Run snapshot for each date ───────────────────────────────────────────
  // fn_take_snapshot(date) recomputes each date's rows purely from the ledger
  // tables (keyed by snapshot_date / month, independent of other dates), so the
  // per-date calls are safe to run concurrently instead of one after another.
  const snapshotResults = await Promise.all(
    datesToRun.map(date =>
      supabase.rpc('fn_take_snapshot', { target_date: date })
        .then(({ data, error }) => ({ date, data, error }))
    )
  )
  for (const { date, data, error } of snapshotResults) {
    log.push(`\n=== ${date} ===`)
    if (error) {
      log.push(`  fn_take_snapshot ERR: ${error.message}`)
    } else {
      const result = data as { log?: string[] }
      if (result?.log) log.push(...result.log)
    }
  }

  log.push('\nDone ✓')
  return Response.json({ ok: true, log })
})
