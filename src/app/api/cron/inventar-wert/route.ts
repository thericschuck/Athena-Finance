import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCron } from '@/lib/api/auth'
import { schaetzeWertverlauf } from '@/lib/data/wertverlauf'

export const maxDuration = 60

/**
 * GET /api/cron/inventar-wert
 *
 * Schreibt den geschätzten Wertverlauf aller aktiven Inventar-Stücke bis heute fort
 * (Modell: lib/inventar/wertmodell.ts). Idempotent: Modellpunkte hinter der letzten
 * Handeingabe werden bei jedem Lauf ersetzt, Handeingaben nie angetastet — ein zweiter Lauf
 * am selben Tag ändert nichts.
 *
 * Nutzer ohne Gegenstände werden übersprungen. Nacheinander, weil je Stück mehrere
 * Abfragen anfallen und die Sammlungen klein sind.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const supabase = createAdminClient()
  const { data: stuecke, error } = await supabase
    .from('valuables')
    .select('user_id')
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((stuecke ?? []).map(s => s.user_id))]
  const results: { user_id: string; verarbeitet?: number; punkte?: number; error?: string }[] = []

  for (const userId of userIds) {
    const res = await schaetzeWertverlauf(supabase, userId)
    results.push(
      'error' in res
        ? { user_id: userId, error: res.error }
        : { user_id: userId, verarbeitet: res.verarbeitet, punkte: res.punkte },
    )
  }

  return NextResponse.json({ ok: results.every(r => !r.error), results })
}
