// Deploy: supabase functions deploy fetch-fund-price
// Cron (Supabase Dashboard → Cron Jobs):
//   Schedule: "*/15 8-20 * * 1-5"  (alle 15 Min, Mo-Fr, 8-20 Uhr)
//   URL: POST /functions/v1/fetch-fund-price

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUND = {
  isin: 'DE0008491051',
  name: 'UniGlobal',
  url: 'https://www.finanzen.net/fonds/uniglobal-de0008491051',
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let html: string
  try {
    const response = await fetch(FUND.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    html = await response.text()
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Fetch failed', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Extrahiert Preise im Format "348,20" – UniGlobal NAV liegt typischerweise zwischen 200 und 800
  const priceMatches = html.match(/(\d{3,4}),(\d{2})/g) ?? []

  let price: number | null = null
  for (const match of priceMatches) {
    const val = parseFloat(match.replace(',', '.'))
    if (val >= 200 && val <= 800) {
      price = val
      break
    }
  }

  if (!price) {
    return new Response(JSON.stringify({ error: 'Price not found in HTML' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const now = new Date().toISOString()
  const today = now.split('T')[0]

  await supabase.from('fund_price_cache').upsert(
    { isin: FUND.isin, fund_name: FUND.name, price, currency: 'EUR', fetched_at: now },
    { onConflict: 'isin' }
  )

  // Historischen Preis einmal täglich speichern
  await supabase.from('fund_prices').upsert(
    { isin: FUND.isin, fund_name: FUND.name, price, price_date: today, currency: 'EUR' },
    { onConflict: 'isin,price_date' }
  )

  return new Response(JSON.stringify({ price, fetched_at: now }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
