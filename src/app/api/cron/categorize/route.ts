import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireCron } from '@/lib/api/auth'
import { applySuggestionsToBacklog } from '@/lib/fints'
import { kategorisiereMitKi } from '@/lib/fints/ai-categorize-lauf'

// Regeln sind schnell; die KI-Stufe braucht je Stapel von 15 Buchungen einige Sekunden. Der Lauf endet selbst nach 200 s.
export const maxDuration = 300

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * GET /api/cron/categorize[?dry=1]
 *
 * Kategorisiert unkategorisierte Bankbuchungen in zwei Stufen:
 *   1. feste Regeln und gelernte Zuordnung (applySuggestionsToBacklog, category_source = 'auto')
 *   2. KI für den Rest (kategorisiereMitKi, category_source = 'ai')
 *
 * Nötig, weil der Cloud-Sync (api/bank-sync.py) nur Buchungen speichert und nie eine category_id setzt; die
 * Kategorisierung im Node-Teil lief dort bisher nie. Läuft nach dem Bank-Sync (siehe vercel.json) und ist idempotent.
 *
 * `dry=1` (mit CRON_SECRET) schreibt nichts, auch nicht Stufe 1, und liefert die KI-Vorschläge als Stichprobe
 * zum Prüfen. Abschaltbar über user_settings.ai_categorization = { "enabled": false } (nur Stufe 2).
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const trockenlauf = req.nextUrl.searchParams.get('dry') === '1'
  const supabase = adminClient()
  const { data: konten, error } = await supabase.from('accounts').select('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((konten ?? []).map(k => k.user_id))]
  const results: Record<string, unknown>[] = []
  for (const userId of userIds) {
    try {
      const regeln = trockenlauf ? { applied: 0 } : await applySuggestionsToBacklog(supabase, userId)
      const ki = await kategorisiereMitKi(supabase, userId, { trockenlauf })
      results.push({ user_id: userId, regeln: regeln.applied, ki })
    } catch (e) {
      results.push({ user_id: userId, error: e instanceof Error ? e.message : 'Unbekannter Fehler' })
    }
  }

  const failed = results.filter(r => 'error' in r).length
  return NextResponse.json({ ok: failed === 0, trockenlauf, results }, { status: failed === 0 ? 200 : 207 })
}
