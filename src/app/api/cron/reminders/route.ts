import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireCron } from '@/lib/api/auth'
import { aktualisiereErinnerungen } from '@/lib/reminders/lauf'

export const maxDuration = 60

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * GET /api/cron/reminders
 *
 * Reminder-Feed: gleicht für jeden Nutzer die festen Erinnerungsregeln (src/lib/reminders/regeln.ts)
 * mit der aktuellen Lage ab und legt neue Hinweise in `insights` an bzw. archiviert erledigte. Kein
 * LLM — deshalb ohne Bestätigungsschritt. Läuft idempotent: ein zweiter Lauf am selben Tag ändert nichts.
 *
 * Nutzer ohne Konto werden übersprungen. Nacheinander statt parallel, weil die Steuerrechnung je Nutzer
 * mehrere Abfragen braucht.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const supabase = adminClient()
  const { data: konten, error } = await supabase.from('accounts').select('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((konten ?? []).map(k => k.user_id))]
  const results: { user_id: string; aktiv?: number; eingefuegt?: number; archiviert?: number; error?: string }[] = []

  for (const userId of userIds) {
    try {
      results.push({ user_id: userId, ...(await aktualisiereErinnerungen(supabase, userId)) })
    } catch (e) {
      results.push({ user_id: userId, error: e instanceof Error ? e.message : 'Unbekannter Fehler' })
    }
  }

  const failed = results.filter(r => r.error).length
  return NextResponse.json({ ok: failed === 0, results }, { status: failed === 0 ? 200 : 207 })
}
