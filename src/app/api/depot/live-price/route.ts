import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Diese Route liest nur den Cache – das Scraping übernimmt ausschließlich
// die Supabase Edge Function (fetch-fund-price) via XPath + deno-dom.
// Cron: alle 15 Min, Mo-Fr 8-20 Uhr.

export async function GET(req: NextRequest) {
  const isin = req.nextUrl.searchParams.get('isin') ?? ''
  if (!isin) return NextResponse.json({ price: null, fetchedAt: null, isLive: false })

  const supabase = await createClient()

  const { data: cache } = await supabase
    .from('fund_price_cache')
    .select('price, fetched_at')
    .eq('isin', isin)
    .maybeSingle()

  if (!cache) {
    return NextResponse.json({ price: null, fetchedAt: null, isLive: false })
  }

  const ageMinutes = (Date.now() - new Date(cache.fetched_at).getTime()) / 60_000

  return NextResponse.json({
    price:     cache.price,
    fetchedAt: cache.fetched_at,
    isLive:    ageMinutes < 20,   // < 20 Min = frisch genug für LIVE-Badge
  })
}
