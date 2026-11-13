/**
 * Zugriff auf die verschluesselten Boersen-Schluessel (`exchange_keys`), Logik ohne Client-Erzeugung (SECURITY-AUDIT.md E1).
 *
 * Der Client wird hereingereicht, damit sich die Logik ohne `@/`-Alias und ohne Datenbank testen laesst. Produktiv ruft nur
 * `./schluessel.ts` das mit dem Service-Role-Client auf: Die Chiffrate `api_key`/`api_secret` sind fuer `authenticated` gesperrt
 * (Migration 20261113130000), der Browser-Client kommt nicht mehr heran.
 *
 * Jede Funktion filtert IMMER auf `user_id` (der Service-Role-Client umgeht die RLS) und weigert sich ohne Nutzer-ID.
 * Entschluesselt wird hier nicht: Das macht der Aufrufer mit `decrypt()`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Db = SupabaseClient<Database>

/** Verschluesselte Felder, wie sie in der Tabelle stehen (Format `iv:authTag:ciphertext`). */
export type VerschluesselterSchluessel = { api_key: string; api_secret: string }

function pruefeNutzer(userId: string): void {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('exchange_keys: user_id fehlt (der Service-Role-Client umgeht die RLS, ohne Nutzer wird nicht zugegriffen)')
  }
}

/** Liest die Chiffrate eines Nutzers. `null`, wenn keine Zeile existiert. Wirft bei einem Datenbankfehler (nie „kein Schluessel“ vortaeuschen). */
export async function ladeSchluessel(db: Db, userId: string, exchange: string): Promise<VerschluesselterSchluessel | null> {
  pruefeNutzer(userId)
  const { data, error } = await db
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', userId)
    .eq('exchange', exchange)
    .maybeSingle()
  if (error) throw new Error(`exchange_keys: ${error.message}`)
  return data
}

/** Legt die (bereits verschluesselten) Felder an oder ersetzt sie. Ergebnis wie bei Supabase: `{ error: Meldung | null }`. */
export async function speichereSchluessel(
  db: Db,
  userId: string,
  exchange: string,
  apiKeyEnc: string,
  apiSecretEnc: string,
): Promise<{ error: string | null }> {
  pruefeNutzer(userId)
  const { error } = await db
    .from('exchange_keys')
    .upsert({ user_id: userId, exchange, api_key: apiKeyEnc, api_secret: apiSecretEnc }, { onConflict: 'user_id,exchange' })
  return { error: error ? error.message : null }
}

/** Loescht den Schluessel eines Nutzers fuer eine Boerse. */
export async function loescheSchluessel(db: Db, userId: string, exchange: string): Promise<{ error: string | null }> {
  pruefeNutzer(userId)
  const { error } = await db.from('exchange_keys').delete().eq('user_id', userId).eq('exchange', exchange)
  return { error: error ? error.message : null }
}
