/**
 * Boersen-Schluessel (`exchange_keys`): Lesen, Speichern, Loeschen ueber den Service-Role-Client (SECURITY-AUDIT.md E1).
 *
 * Einziger Weg an die Chiffrate `api_key`/`api_secret`. Der Browser-Client (`authenticated`) hat darauf kein Recht mehr; Aufrufer
 * muessen also NICHT `createClient()` aus `@/lib/supabase/server` benutzen. Entschluesselt wird beim Aufrufer (`decrypt()`).
 * Die Logik (immer mit `user_id`-Filter) steht in `schluessel-core.ts`.
 *
 * Nur serverseitig verwenden (Server Actions, Route Handler, Cron).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeSchluessel, loescheSchluessel, speichereSchluessel, type VerschluesselterSchluessel } from './schluessel-core'

export type { VerschluesselterSchluessel }

/** Chiffrate des Nutzers oder `null`. Wirft bei Datenbankfehlern. */
export function ladeBoersenSchluessel(userId: string, exchange: string): Promise<VerschluesselterSchluessel | null> {
  return ladeSchluessel(createAdminClient(), userId, exchange)
}

/** Speichert bereits verschluesselte Felder. */
export function speichereBoersenSchluessel(
  userId: string,
  exchange: string,
  apiKeyEnc: string,
  apiSecretEnc: string,
): Promise<{ error: string | null }> {
  return speichereSchluessel(createAdminClient(), userId, exchange, apiKeyEnc, apiSecretEnc)
}

/** Loescht den Schluessel des Nutzers fuer die Boerse. */
export function loescheBoersenSchluessel(userId: string, exchange: string): Promise<{ error: string | null }> {
  return loescheSchluessel(createAdminClient(), userId, exchange)
}
