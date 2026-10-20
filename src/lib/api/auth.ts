import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { checkCronAuth } from './cron-auth'

/**
 * Cron-Auth: `Authorization: Bearer <CRON_SECRET>`.
 *
 * Fail-closed: ohne gesetztes CRON_SECRET wird jede Anfrage abgelehnt. Der frühere Vergleich
 * `auth !== \`Bearer ${process.env.CRON_SECRET}\`` ließ bei fehlender Variable den Header
 * `Bearer undefined` durch. Der Vergleich läuft in konstanter Zeit.
 *
 * Gibt `null` zurück, wenn die Anfrage autorisiert ist, sonst die fertige Fehler-Response:
 *   const denied = requireCron(req); if (denied) return denied
 */
export function requireCron(req: Request): NextResponse | null {
  const result = checkCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET)
  if (result === 'unconfigured') {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 })
  }
  if (result === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * Session-Auth für Route Handler. `src/proxy.ts` schließt `/api` vom Matcher aus, jede Route
 * muss den Login deshalb selbst prüfen.
 *
 *   const auth = await requireUser(); if (auth.response) return auth.response
 *   const { user, supabase } = auth
 */
export async function requireUser() {
  const { supabase, user } = await getAuthUser()
  if (!user) {
    return {
      response: NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 }),
      user: null,
      supabase,
    } as const
  }
  return { response: null, user, supabase } as const
}
