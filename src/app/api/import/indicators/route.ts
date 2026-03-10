import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { indicators: Record<string, unknown>[]; backtests?: Record<string, unknown>[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { indicators, backtests } = body

  if (!Array.isArray(indicators)) {
    return Response.json({ error: 'indicators must be an array' }, { status: 400 })
  }

  // Map old id → new id for backtests
  const idMap = new Map<string, string>()
  let importedIndicators = 0
  let importedBacktests = 0

  for (const indicator of indicators) {
    const oldId = indicator.id as string | undefined
    // Strip id and set user_id
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = indicator
    const toInsert = { ...rest, user_id: user.id }

    const { data: inserted, error } = await supabase
      .from('indicators')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(toInsert as any)
      .select('id')
      .single()

    if (error || !inserted) {
      continue
    }

    importedIndicators++
    if (oldId) {
      idMap.set(oldId, inserted.id)
    }
  }

  if (backtests && Array.isArray(backtests) && backtests.length > 0) {
    const backtestRows = backtests
      .map((bt) => {
        const oldIndicatorId = bt.indicator_id as string | undefined
        if (!oldIndicatorId) return null
        const newIndicatorId = idMap.get(oldIndicatorId)
        if (!newIndicatorId) return null
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...rest } = bt
        return { ...rest, indicator_id: newIndicatorId, user_id: user.id }
      })
      .filter(Boolean)

    if (backtestRows.length > 0) {
      const { data: insertedBacktests, error: btError } = await supabase
        .from('indicator_performance')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(backtestRows as any)
        .select('id')

      if (!btError) {
        importedBacktests = insertedBacktests?.length ?? 0
      }
    }
  }

  return Response.json({ imported_indicators: importedIndicators, imported_backtests: importedBacktests })
}
