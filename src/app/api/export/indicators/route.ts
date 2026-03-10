import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const withBacktests = searchParams.get('with_backtests') === 'true'

  const { data: indicators, error } = await supabase
    .from('indicators')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) {
    return new Response('Error fetching indicators', { status: 500 })
  }

  const data: { indicators: unknown[]; backtests?: unknown[] } = {
    indicators: indicators ?? [],
  }

  if (withBacktests) {
    const indicatorIds = (indicators ?? []).map((i) => i.id)
    if (indicatorIds.length > 0) {
      const { data: backtests } = await supabase
        .from('indicator_performance')
        .select('*')
        .in('indicator_id', indicatorIds)
        .order('created_at', { ascending: false })

      data.backtests = backtests ?? []
    } else {
      data.backtests = []
    }
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="indikatoren.json"',
    },
  })
}
