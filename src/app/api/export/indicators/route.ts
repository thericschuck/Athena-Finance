import type { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { z } from 'zod'
import { parseQuery } from '@/lib/api/validate'

const querySchema = z.object({
  with_backtests: z.string().max(10).optional().transform(v => v === 'true'),
})

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const withBacktests = q.data.with_backtests

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
