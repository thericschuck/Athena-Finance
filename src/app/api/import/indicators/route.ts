import type { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/database'
import { z } from 'zod'
import { parseBody } from '@/lib/api/validate'

// Export-JSON der App selbst; die Spaltenstruktur prüft die DB. Hier nur Form und Größe.
const importSchema = z.object({
  indicators: z.array(z.record(z.string(), z.unknown())).max(2000),
  backtests: z.array(z.record(z.string(), z.unknown())).max(20000).optional(),
})

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseBody(req, importSchema)
  if (parsed.response) return parsed.response
  const { indicators, backtests } = parsed.data

  // Map old id → new id for backtests
  const idMap = new Map<string, string>()
  let importedIndicators = 0
  let importedBacktests = 0

  // Each indicator insert is independent (no cross-row references at insert time),
  // so run them concurrently instead of one-by-one.
  const insertResults = await Promise.all(
    indicators.map(async (indicator) => {
      const oldId = indicator.id as string | undefined
      // Strip id and set user_id
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...rest } = indicator
      const toInsert = { ...rest, user_id: user.id }

      const { data: inserted, error } = await supabase
        .from('indicators')
        // Export-JSON des Users selbst; Struktur wird erst von der DB geprüft.
        .insert(toInsert as unknown as TablesInsert<'indicators'>)
        .select('id')
        .single()

      if (error || !inserted) return null
      return { oldId, newId: inserted.id }
    })
  )

  for (const result of insertResults) {
    if (!result) continue
    importedIndicators++
    if (result.oldId) {
      idMap.set(result.oldId, result.newId)
    }
  }

  if (backtests && backtests.length > 0) {
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
        .insert(backtestRows as unknown as TablesInsert<'indicator_performance'>[])
        .select('id')

      if (!btError) {
        importedBacktests = insertedBacktests?.length ?? 0
      }
    }
  }

  return Response.json({ imported_indicators: importedIndicators, imported_backtests: importedBacktests })
}
