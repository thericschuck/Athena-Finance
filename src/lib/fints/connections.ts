/**
 * FinTS-Verbindungen pro Nutzer (Tabelle `bank_connections`) — Datenbankschicht.
 * Konzept und Threat Model: docs/fints-verbindungen.md. Reine Logik: ./connections-core.ts.
 *
 * Alle Zugriffe laufen mit dem Service-Role-Client (createAdminClient), jeweils mit explizitem user_id-Filter:
 * Die verschluesselten Spalten sind fuer `authenticated` per Spaltenrecht nicht lesbar, und Schreiben/Entschluesseln
 * gehoeren ohnehin auf den Server. Der Aufrufer muss den Nutzer vorher authentifiziert haben.
 *
 * Typ-Hinweis: `bank_connections` steht noch nicht in src/types/database.ts (Migration noch nicht angewendet). Bis zur
 * Regenerierung der Typen wird der Client deshalb untyped verwendet; die Zeilentypen kommen aus connections-core.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  PUBLIC_COLUMNS, buildInsertRow, isEnvConnectionUser, resolveFromRows, rowToPublic, validateFintsUrl,
  normalizeBlz, encryptSecret,
  type BankConnectionPublic, type BankConnectionRow, type NewConnectionInput, type ResolvedConnections,
} from './connections-core'

export type {
  BankConnectionPublic, BankCredentials, NewConnectionInput, ResolvedConnections,
} from './connections-core'
export { deriveBankKey, maskUsername, validateFintsUrl, envCredentials, isEnvConnectionUser } from './connections-core'

const TABLE = 'bank_connections'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Postgres-Fehler fuer den Client entschaerfen (keine Spalten-/Constraint-Details). */
function friendly(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('Diese Bankverbindung (gleiche BLZ und Benutzerkennung) existiert bereits.')
  if (error.code === '42P01') return new Error('Die Bankverbindungen sind noch nicht eingerichtet (Datenbank-Migration fehlt).')
  console.warn('[fints] bank_connections:', error.code ?? '', error.message)
  return new Error('Die Bankverbindung konnte nicht gespeichert werden.')
}

/** Liste fuer die UI — ohne Geheimnisse. */
export async function listBankConnections(userId: string): Promise<BankConnectionPublic[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) {
    // Tabelle fehlt (Migration offen) oder anderer Fehler: UI zeigt dann eine leere Liste statt abzustuerzen.
    if (error.code !== '42P01') console.warn('[fints] Verbindungen nicht ladbar:', error.code ?? '', error.message)
    return []
  }
  return ((data ?? []) as unknown as Omit<BankConnectionRow, 'username_enc' | 'pin_enc'>[]).map(rowToPublic)
}

export async function createBankConnection(userId: string, input: NewConnectionInput): Promise<void> {
  const url = validateFintsUrl(input.fintsUrl)
  if (!url.ok) throw new Error(url.error)
  const blz = normalizeBlz(input.blz)
  if (blz.length !== 8) throw new Error('Die BLZ muss genau 8 Ziffern haben.')
  const row = buildInsertRow(userId, { ...input, blz, fintsUrl: url.url })
  const { error } = await db().from(TABLE).insert(row)
  if (error) throw friendly(error)
}

/**
 * Bezeichnung, Bank-URL, TAN-Medium und PIN aendern. Die Benutzerkennung bleibt fest (sie bestimmt den bank_key und
 * damit den Client-State); soll sie sich aendern, die Verbindung loeschen und neu anlegen. Leere PIN = unveraendert.
 */
export async function updateBankConnection(
  userId: string,
  id: string,
  patch: { label?: string; fintsUrl?: string; tanMedium?: string | null; pin?: string },
): Promise<void> {
  const row: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (patch.label !== undefined) row.label = patch.label.trim()
  if (patch.fintsUrl !== undefined) {
    const url = validateFintsUrl(patch.fintsUrl)
    if (!url.ok) throw new Error(url.error)
    row.fints_url = url.url
  }
  if (patch.tanMedium !== undefined) row.tan_medium = patch.tanMedium?.trim() || null
  if (patch.pin) {
    row.pin_enc = encryptSecret(patch.pin)
  }
  const { data, error } = await db().from(TABLE).update(row).eq('id', id).eq('user_id', userId).select('id')
  if (error) throw friendly(error)
  if (!data || data.length === 0) throw new Error('Bankverbindung nicht gefunden.')
}

export async function deleteBankConnection(userId: string, id: string): Promise<void> {
  const { data, error } = await db().from(TABLE).delete().eq('id', id).eq('user_id', userId).select('id')
  if (error) throw friendly(error)
  if (!data || data.length === 0) throw new Error('Bankverbindung nicht gefunden.')
}

async function loadRows(userId: string): Promise<BankConnectionRow[]> {
  const { data, error } = await db().from(TABLE).select(`${PUBLIC_COLUMNS}, username_enc, pin_enc`).eq('user_id', userId)
  if (error) {
    if (error.code === '42P01') return [] // Migration noch nicht angewendet -> reiner Env-Betrieb
    // Wichtig: NICHT still auf Env zurueckfallen, sonst wuerde ein DB-Fehler eine vorhandene Verbindung uebergehen.
    throw new Error('Bankverbindungen konnten nicht geladen werden.')
  }
  return (data ?? []) as unknown as BankConnectionRow[]
}

/**
 * Zugangsdaten fuer den Sync: eigene Verbindungen, sonst Env-Verbindung (nur Env-Nutzer), sonst leer.
 * Entschluesselt — Ergebnis nur serverseitig verwenden, nie loggen, nie an den Client geben.
 */
export async function resolveConnectionsForUser(userId: string): Promise<ResolvedConnections> {
  return resolveFromRows(userId, await loadRows(userId), process.env)
}

/**
 * Darf dieser Nutzer synchronisieren? Ja, wenn er mindestens eine eigene Verbindung hat oder der Env-Nutzer ist.
 * Entschluesselt nichts (zaehlt nur Zeilen). Ersetzt den alten Guard `userId === BANK_SYNC_USER_ID`.
 */
export async function userHasBankAccess(userId: string): Promise<boolean> {
  if (isEnvConnectionUser(userId, process.env)) return true
  const { count, error } = await db().from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (error) return false
  return (count ?? 0) > 0
}

/** Vermerkt Ergebnis des letzten Syncs je Verbindung (Fehlertext wird gekuerzt; er enthaelt nie Zugangsdaten). */
export async function recordSyncResult(
  userId: string,
  bankKeys: string[],
  result: { ok: boolean; error?: string | null },
): Promise<void> {
  if (bankKeys.length === 0) return
  const now = new Date().toISOString()
  const patch = result.ok
    ? { last_sync_at: now, last_error: null }
    : { last_error: (result.error ?? 'Unbekannter Fehler').slice(0, 300) }
  const { error } = await db().from(TABLE).update(patch).eq('user_id', userId).in('bank_key', bankKeys)
  if (error && error.code !== '42P01') console.warn('[fints] Sync-Status nicht speicherbar:', error.code ?? '')
}
