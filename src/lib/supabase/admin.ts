import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { PERF_ENABLED, createPerfFetch } from '@/lib/perf/perf-log'

/**
 * Zentrale Factory fuer den Service-Role-Client (umgeht RLS!).
 *
 * Nur serverseitig verwenden (Cron-Routen, FinTS-State, Kraken-Sync). Wer ihn nutzt, filtert von Hand und darf nichts ueber
 * Haushaltsgrenzen leaken: owner-only-Daten immer mit user_id, Haushaltsdaten ueber den Haushalt des Nutzers.
 * (Das Paket `server-only` ist nicht installiert; der Laufzeit-Check unten ersetzt es.)
 */
export type AdminClient = SupabaseClient<Database>

export function createAdminClient(): AdminClient {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient darf nur auf dem Server aufgerufen werden')
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      // Nur bei PERF_LOG=1 (Admin-Client laeuft ausserhalb eines Seiten-Requests, daher feste Kennung).
      ...(PERF_ENABLED ? { global: { fetch: createPerfFetch({ rid: 'admin', route: 'admin-client' }, 'admin') } } : {}),
    },
  )
}
