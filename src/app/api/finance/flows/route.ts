import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { parseQuery } from '@/lib/api/validate'
import { getMonthlyFlowsScope } from '@/lib/data/flows-scope'

const querySchema = z.object({
  source: z.enum(['manual', 'bank_sync']).optional(),
})

/**
 * GET /api/finance/flows?source=bank_sync
 *
 * Monatssummen je Konto, Art (echt/anlage/forderung) und Kategorie aus `monthly_flows` —
 * dieselbe Quelle wie Dashboard und Analyse. Liefert immer alle Arten; ob Anlagen und
 * Forderungen mitzählen, entscheidet der Aufrufer (Schalter `anlage`).
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = parseQuery(request, querySchema)
  if (parsed.response) return parsed.response

  try {
    const rows = await getMonthlyFlowsScope(supabase, await resolveScope(supabase, user), { source: parsed.data.source })
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 })
  }
}
