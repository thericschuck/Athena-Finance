// Deploy: supabase functions deploy fetch-fund-price
// Cron (Supabase Dashboard → Cron Jobs):
//   Schedule: "*/15 8-20 * * 1-5"  (alle 15 Min, Mo-Fr, 8-20 Uhr)
//   URL: POST /functions/v1/fetch-fund-price

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Yahoo Finance Helpers ────────────────────────────────────────────────────

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

/** Sucht den Yahoo-Finance-Ticker zu einer ISIN (z.B. "DE0008491051" → "0P0000WFHL.F") */
async function findTicker(isin: string): Promise<string | null> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0&enableFuzzyQuery=false&enableNavLinks=false`
  try {
    const res = await fetch(url, { headers: YF_HEADERS })
    if (!res.ok) return null
    const json = await res.json()
    const quotes: any[] = json?.finance?.result?.[0]?.quotes ?? json?.quotes ?? []
    // Präferiere Fonds-Quoten (quoteType MUTUALFUND oder ETF)
    const fund = quotes.find((q: any) => q.quoteType === 'MUTUALFUND' || q.quoteType === 'ETF')
    return fund?.symbol ?? quotes[0]?.symbol ?? null
  } catch {
    return null
  }
}

/** Holt den aktuellen Preis eines Yahoo-Finance-Tickers (v8 chart API) */
async function fetchQuote(ticker: string): Promise<{ price: number; currency: string } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
  try {
    const res = await fetch(url, { headers: YF_HEADERS })
    if (!res.ok) return null
    const json = await res.json()
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    return { price: meta.regularMarketPrice, currency: meta.currency ?? 'EUR' }
  } catch {
    return null
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: sources, error: srcError } = await supabase
    .from('fund_sources')
    .select('isin, name, url, xpath, ticker, currency')

  if (srcError || !sources?.length) {
    return new Response(
      JSON.stringify({ error: 'Keine Fonds-Quellen gefunden', detail: srcError?.message }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const now = new Date().toISOString()
  const today = now.split('T')[0]
  const results: object[] = []

  for (const fund of sources) {
    // 1. Ticker ermitteln (aus Cache oder Yahoo-Suche)
    let ticker: string | null = fund.ticker ?? null

    if (!ticker) {
      ticker = await findTicker(fund.isin)
      if (!ticker) {
        results.push({ isin: fund.isin, error: 'Kein Yahoo-Finance-Ticker gefunden' })
        continue
      }
      // Ticker cachen
      await supabase.from('fund_sources').update({ ticker }).eq('isin', fund.isin)
    }

    // 2. Preis von Yahoo Finance holen
    const quote = await fetchQuote(ticker)
    if (!quote) {
      results.push({ isin: fund.isin, ticker, error: 'Preis von Yahoo Finance nicht abrufbar' })
      continue
    }

    const { price, currency } = quote

    // 3. In Cache und Historie speichern
    await supabase.from('fund_price_cache').upsert(
      { isin: fund.isin, fund_name: fund.name, price, currency, fetched_at: now },
      { onConflict: 'isin' }
    )

    await supabase.from('fund_prices').upsert(
      { isin: fund.isin, fund_name: fund.name, price, price_date: today, currency },
      { onConflict: 'isin,price_date' }
    )

    results.push({ isin: fund.isin, name: fund.name, ticker, price, currency, fetched_at: now })
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})
