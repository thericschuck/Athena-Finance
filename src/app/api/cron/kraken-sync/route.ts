import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncKrakenForUser } from '@/lib/kraken/sync'
import { requireCron } from '@/lib/api/auth'

// Der Sync selbst ist schnell (Balance + Assets + AssetPairs + ein Ticker-Call), aber
// `fetchKrakenTradesHistory()` blättert bis zu 10 Seiten mit je 1,5 s Pause dazwischen — die
// Kostenbasis ist der lange Teil, nicht die Bestände.
export const maxDuration = 120

/**
 * GET /api/cron/kraken-sync
 *
 * Planmäßiger Kraken-Spot-Sync, alle 6 Stunden (siehe vercel.json).
 *
 * Vorher gab es diesen Job nicht: Mengen und Einstandspreise aktualisierten sich
 * ausschließlich, wenn jemand im Crypto-Tab auf „Jetzt synchronisieren" klickte. Zwischen
 * zwei Klicks zeigte die App die Bestände vom letzten Klick — am 31.08.2026 waren das die
 * vom 29.08.
 *
 * Anders als /api/cron/bank-sync ist dieser Job mandantenfähig: die Kraken-Zugangsdaten
 * hängen pro Nutzer in `exchange_keys`, nicht in globalen Env-Variablen. Deshalb wird über
 * alle hinterlegten Schlüssel iteriert statt über eine feste User-ID.
 *
 * Nutzer werden nacheinander abgearbeitet, nicht parallel: Kraken zählt das Rate-Limit pro
 * API-Schlüssel, aber TradesHistory ist teuer und mehrere gleichzeitige Sync-Läufe würden
 * sich auf der Function-Laufzeit gegenseitig ausbremsen.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req)
  if (denied) return denied

  const supabase = createAdminClient()

  const { data: keyRows, error } = await supabase
    .from('exchange_keys')
    .select('user_id')
    .eq('exchange', 'kraken')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const userIds = [...new Set((keyRows ?? []).map(r => r.user_id))]
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'Kein Kraken-Schlüssel hinterlegt', results: [] })
  }

  const results: { user_id: string; synced?: number; warnings?: string[]; error?: string }[] = []

  for (const userId of userIds) {
    try {
      const result = await syncKrakenForUser(supabase, userId)
      results.push(
        'error' in result
          ? { user_id: userId, error: result.error }
          : { user_id: userId, synced: result.synced, warnings: result.warnings },
      )
    } catch (e) {
      // Ein Fehler bei einem Nutzer darf die übrigen nicht abbrechen — er landet im
      // Ergebnis, damit der Vercel-Log zeigt, welcher Schlüssel klemmt.
      results.push({ user_id: userId, error: (e as Error).message })
    }
  }

  const failed = results.filter(r => r.error).length
  return NextResponse.json({ ok: failed === 0, synced_users: results.length - failed, results })
}
