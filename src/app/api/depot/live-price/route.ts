import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FUND = {
  isin:     'DE0008491051',
  name:     'UniGlobal',
  url:      'https://www.finanzen.net/fonds/uniglobal-de0008491051',
  minPrice: 200,
  maxPrice: 800,
}

async function scrapePrice(): Promise<number | null> {
  try {
    const res  = await fetch(FUND.url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      next: { revalidate: 0 },
    })
    const html = await res.text()
    const matches = html.match(/(\d{3,4}),(\d{2})/g) ?? []
    for (const m of matches) {
      const val = parseFloat(m.replace(',', '.'))
      if (val >= FUND.minPrice && val <= FUND.maxPrice) return val
    }
    return null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const isin     = req.nextUrl.searchParams.get('isin') ?? FUND.isin
  const supabase = await createClient()

  // Read current cache
  const { data } = await supabase
    .from('fund_price_cache')
    .select('price, fetched_at')
    .eq('isin', isin)
    .single()

  const ageMinutes = data
    ? (Date.now() - new Date(data.fetched_at).getTime()) / 60_000
    : Infinity

  // Cache empty or older than 30 min → scrape
  if (ageMinutes > 30) {
    const price = await scrapePrice()
    if (price) {
      const now   = new Date().toISOString()
      const today = now.split('T')[0]

      // Update price cache
      await supabase.from('fund_price_cache').upsert(
        { isin, fund_name: FUND.name, price, currency: 'EUR', fetched_at: now },
        { onConflict: 'isin' }
      )

      // Also persist in fund_prices for historical chart (once per day)
      await supabase.from('fund_prices').upsert(
        { isin, fund_name: FUND.name, price, price_date: today, currency: 'EUR' },
        { onConflict: 'isin,price_date' }
      )

      return NextResponse.json({ price, fetchedAt: now, isLive: true })
    }

    // Scrape failed – return stale data if available, otherwise null
    return NextResponse.json({
      price:     data?.price     ?? null,
      fetchedAt: data?.fetched_at ?? null,
      isLive:    false,
    })
  }

  return NextResponse.json({
    price:     data!.price,
    fetchedAt: data!.fetched_at,
    isLive:    ageMinutes < 30,
  })
}
