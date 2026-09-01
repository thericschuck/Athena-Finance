import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBankScaStatus } from '@/lib/fints/state'

/**
 * GET /api/bank/sca-status
 *
 * Wann wurde zuletzt eine SecureGo-plus-Freigabe erteilt, bis wann läuft die daraus
 * folgende freigabefreie Periode (PSD2, 90 Tage), und hängt gerade ein automatischer
 * Sync daran fest, dass eine neue Freigabe fällig ist?
 *
 * Die Tabelle `fints_client_state` ist bewusst nur über die Service-Role erreichbar,
 * deshalb geht die Abfrage über diese Route und nicht direkt aus dem Client.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const banks = await getBankScaStatus(user.id)
  return NextResponse.json({ banks })
}
