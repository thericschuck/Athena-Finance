import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { z } from 'zod'
import { parseQuery } from '@/lib/api/validate'

const querySchema = z.object({
  isin: z.string().trim().max(32).optional().default(''),
})

// Diese Route liest nur den Cache – das Scraping übernimmt ausschließlich
// die Supabase Edge Function (fetch-fund-price) via XPath + deno-dom.
// Cron: alle 15 Min, Mo-Fr 8-20 Uhr.

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response

  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const { isin } = q.data
  if (!isin) return NextResponse.json({ price: null, fetchedAt: null, isLive: false })

  const { supabase } = auth

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
