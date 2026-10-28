import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCron } from '@/lib/api/auth'
import { fuehreReviewAus } from '@/lib/assistant/review'

// Ein agentischer Lauf mit bis zu 24 Werkzeugschritten braucht Zeit; 300 s ist das Maximum.
export const maxDuration = 300

/**
 * GET /api/cron/athena-review[?force=1]
 *
 * Athena-Wochenlauf (LLM, nur Lese-Werkzeuge, Ausgabe nur über meldeBefund — siehe lib/assistant/review.ts).
 * Wöchentlich per Vercel-Cron; `force=1` (mit CRON_SECRET) umgeht den 5-Tage-Abstand für einen Probelauf.
 * Abschaltbar über user_settings.athena_review = { "enabled": false }.
 *
 * Nutzer nacheinander, und ein Fehler bei einem bricht die übrigen nicht ab.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const force = req.nextUrl.searchParams.get('force') === '1'
  const supabase = createAdminClient()
  const { data: konten, error } = await supabase.from('accounts').select('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((konten ?? []).map(k => k.user_id))]
  const results: Record<string, unknown>[] = []
  for (const userId of userIds) {
    try {
      results.push({ user_id: userId, ...(await fuehreReviewAus(supabase, userId, { force })) })
    } catch (e) {
      results.push({ user_id: userId, error: e instanceof Error ? e.message : 'Unbekannter Fehler' })
    }
  }

  const failed = results.filter(r => 'error' in r).length
  return NextResponse.json({ ok: failed === 0, results }, { status: failed === 0 ? 200 : 207 })
}
