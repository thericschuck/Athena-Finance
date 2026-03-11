// Deploy:   supabase functions deploy daily-snapshot
// Schedule: Supabase Dashboard → Cron Jobs → "59 23 * * *" → POST /functions/v1/daily-snapshot
//
// Ablauf:
//   1. CoinGecko-Preise holen → in crypto_price_cache schreiben
//   2. Fehlende Tage der letzten 3 Tage erkennen (catch-up)
//   3. fn_take_snapshot(date) für jeden fehlenden + heutigen Tag aufrufen

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CoinGecko symbol → coin ID ───────────────────────────────────────────────
const GECKO_IDS: Record<string, string> = {
  BTC:   'bitcoin',
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
}

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Allow Supabase dashboard cron (no auth header) + manual calls with secret
  const auth = req.headers.get('Authorization') ?? ''
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (secret && auth !== `Bearer ${secret}`) {
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
    .eq('type', 'crypto')
    .not('symbol', 'is', null)
    .gt('quantity', 0)

  const symbols = [...new Set(
    (cryptoAssets ?? []).map(a => (a.symbol as string).toUpperCase())
  )]

  if (symbols.length) {
    const geckoIds = symbols.map(s => GECKO_IDS[s] ?? s.toLowerCase()).join(',')
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=eur`,
        { headers: { Accept: 'application/json' } },
      )
      if (res.ok) {
        const data = await res.json() as Record<string, { eur?: number }>
        const rows = symbols
          .map(sym => ({
            symbol:     sym,
            price_eur:  data[GECKO_IDS[sym] ?? sym.toLowerCase()]?.eur ?? 0,
            updated_at: new Date().toISOString(),
          }))
          .filter(r => r.price_eur > 0)

        const { error } = await supabase
          .from('crypto_price_cache')
          .upsert(rows, { onConflict: 'symbol' })

        if (error) log.push(`crypto_price_cache ERR: ${error.message}`)
        else        log.push(`crypto prices updated: ${rows.map(r => `${r.symbol}=€${r.price_eur}`).join(', ')}`)
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
  for (const date of datesToRun) {
    log.push(`\n=== ${date} ===`)
    const { data, error } = await supabase.rpc('fn_take_snapshot', { target_date: date })
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
