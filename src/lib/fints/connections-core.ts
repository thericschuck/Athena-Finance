/**
 * Reiner Kern der FinTS-Verbindungen pro Nutzer (ohne Datenbank, ohne next/@-Aliasse, damit unter
 * `node --experimental-strip-types` testbar). Die DB-Zugriffe stehen in `connections.ts`.
 *
 * Sicherheitsregeln:
 *  - Benutzerkennung und PIN werden NUR hier ver- und entschluesselt (AES-256-GCM via src/lib/encryption.ts).
 *  - Entschluesselte Werte (BankCredentials) verlassen den Server nie Richtung Browser. Fuer den Client gibt es
 *    ausschliesslich `BankConnectionPublic` (ohne Geheimnisse, mit maskiertem Benutzernamen).
 *  - Keine Geheimnisse in Fehlermeldungen oder Logs.
 */
import { createHash } from 'node:crypto'
import { decrypt, encrypt } from '../encryption.ts'

/** Spalten, die ein authentifizierter Nutzer lesen darf (siehe Migration 20261030100000: Spaltenrechte). */
export const PUBLIC_COLUMNS =
  'id, user_id, label, bank_key, blz, fints_url, username_hint, tan_medium, created_at, updated_at, last_sync_at, last_error'

/** Zeile aus `bank_connections` inkl. verschluesselter Felder (nur serverseitig mit Service-Role lesbar). */
export interface BankConnectionRow {
  id: string
  user_id: string
  label: string
  bank_key: string
  blz: string
  fints_url: string
  username_enc: string
  username_hint: string | null
  pin_enc: string
  tan_medium: string | null
  created_at: string
  updated_at: string
  last_sync_at: string | null
  last_error: string | null
}

/** Fuer die UI: keine Geheimnisse. */
export interface BankConnectionPublic {
  id: string
  label: string
  blz: string
  fintsUrl: string
  /** Maskiert, z. B. "***x1z". */
  usernameHint: string | null
  tanMedium: string | null
  createdAt: string
  lastSyncAt: string | null
  lastError: string | null
}

/** Entschluesselte Zugangsdaten fuer einen Sync-Lauf. NIE an den Client geben, NIE loggen. */
export interface BankCredentials {
  /** Zeilen-ID in bank_connections, null bei der Env-Verbindung. */
  connectionId: string | null
  source: 'db' | 'env'
  label: string
  bankKey: string
  blz: string
  url: string
  username: string
  pin: string
  tanMedium: string | null
}

export interface NewConnectionInput {
  label: string
  fintsUrl: string
  blz: string
  username: string
  pin: string
  tanMedium?: string | null
}

export type BankConnectionInsertRow = Omit<
  BankConnectionRow,
  'id' | 'created_at' | 'updated_at' | 'last_sync_at' | 'last_error'
>

export type EnvLike = Record<string, string | undefined>

// ── Normalisierung / Schluessel ──────────────────────────────────────────────

export function normalizeBlz(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function normalizeUsername(raw: string): string {
  return raw.trim()
}

/**
 * Identisch zu bank_key() in scripts/fints/fints_sync.py und api/bank-sync.py:
 * sha256("<blz>:<username>") hex, erste 32 Zeichen. blz nur Ziffern, username getrimmt.
 */
export function deriveBankKey(blz: string, username: string): string {
  return createHash('sha256')
    .update(`${normalizeBlz(blz)}:${normalizeUsername(username)}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/** "***" + letzte 3 Zeichen; bei kurzen Kennungen nur "***". */
export function maskUsername(username: string): string {
  const u = normalizeUsername(username)
  return u.length > 6 ? `***${u.slice(-3)}` : '***'
}

// ── URL-Pruefung (SSRF-Schutz) ───────────────────────────────────────────────

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string }

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/**
 * Nur https, kein Benutzer/Passwort in der URL, Standardport, kein localhost/IP-Literal/interner Name.
 * Verhindert, dass ein Nutzer den Server beliebige interne Ziele anfragen laesst. (DNS-Rebinding schliesst das nicht
 * aus; die Bank-URL ist aber ohnehin nur fuer den eigenen Nutzer wirksam. Siehe docs/fints-verbindungen.md.)
 */
export function validateFintsUrl(raw: string): UrlCheck {
  const bad = (error: string): UrlCheck => ({ ok: false, error })
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return bad('Die Bank-URL ist ungültig.')
  }
  if (u.protocol !== 'https:') return bad('Die Bank-URL muss mit https:// beginnen.')
  if (u.username || u.password) return bad('Die Bank-URL darf keine Zugangsdaten enthalten.')
  if (u.port && u.port !== '443') return bad('Die Bank-URL darf nur den Standardport 443 verwenden.')
  const host = u.hostname.toLowerCase()
  if (host.startsWith('[') || host.includes(':')) return bad('Die Bank-URL muss einen Domainnamen enthalten, keine IP-Adresse.')
  if (/^\d+(\.\d+){3}$/.test(host) || isPrivateIpv4(host)) return bad('Die Bank-URL muss einen Domainnamen enthalten, keine IP-Adresse.')
  if (!host.includes('.') || host === 'localhost' || /\.(local|localhost|internal|lan|intranet|home|corp)$/.test(host)) {
    return bad('Die Bank-URL zeigt auf keine öffentliche Adresse.')
  }
  return { ok: true, url: u.toString() }
}

// ── Ver-/Entschluesseln ──────────────────────────────────────────────────────

/** Einzelnes Geheimnis (z. B. neue PIN) verschluesseln. */
export const encryptSecret = encrypt

/** Baut die zu speichernde Zeile. Klartext von Benutzerkennung und PIN steht danach nirgends in der Struktur. */
export function buildInsertRow(userId: string, input: NewConnectionInput): BankConnectionInsertRow {
  const blz = normalizeBlz(input.blz)
  const username = normalizeUsername(input.username)
  const tan = input.tanMedium?.trim() || null
  return {
    user_id: userId,
    label: input.label.trim(),
    bank_key: deriveBankKey(blz, username),
    blz,
    fints_url: input.fintsUrl.trim(),
    username_enc: encrypt(username),
    username_hint: maskUsername(username),
    pin_enc: encrypt(input.pin),
    tan_medium: tan,
  }
}

/** Entschluesselt eine Zeile. Fehlermeldung enthaelt nie Klartext oder Chiffretext. */
export function rowToCredentials(row: BankConnectionRow): BankCredentials {
  let username: string
  let pin: string
  try {
    username = decrypt(row.username_enc)
    pin = decrypt(row.pin_enc)
  } catch {
    throw new Error(
      `Bankverbindung „${row.label}“ konnte nicht entschlüsselt werden (ENCRYPTION_KEY geändert?). Bitte neu eintragen.`,
    )
  }
  return {
    connectionId: row.id,
    source: 'db',
    label: row.label,
    bankKey: row.bank_key,
    blz: row.blz,
    url: row.fints_url,
    username,
    pin,
    tanMedium: row.tan_medium,
  }
}

export function rowToPublic(row: Omit<BankConnectionRow, 'username_enc' | 'pin_enc'>): BankConnectionPublic {
  return {
    id: row.id,
    label: row.label,
    blz: row.blz,
    fintsUrl: row.fints_url,
    usernameHint: row.username_hint,
    tanMedium: row.tan_medium,
    createdAt: row.created_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  }
}

// ── Env-Fallback ─────────────────────────────────────────────────────────────

/** Die bisherige globale Verbindung aus FINTS_URL/BLZ/USERNAME/PIN, oder null wenn unvollstaendig. */
export function envCredentials(env: EnvLike): BankCredentials | null {
  const url = (env.FINTS_URL ?? '').trim()
  const blz = normalizeBlz(env.FINTS_BLZ ?? '')
  const username = normalizeUsername(env.FINTS_USERNAME ?? '')
  const pin = (env.FINTS_PIN ?? '').trim()
  if (!url || blz.length !== 8 || !username || !pin) return null
  return {
    connectionId: null,
    source: 'env',
    label: (env.FINTS_LABEL ?? '').trim() || 'Raiffeisenbank',
    bankKey: deriveBankKey(blz, username),
    blz,
    url,
    username,
    pin,
    tanMedium: null,
  }
}

/** Ist dieser Nutzer der Env-Nutzer (BANK_SYNC_USER_ID) und die Env-Verbindung vollstaendig? */
export function isEnvConnectionUser(userId: string, env: EnvLike): boolean {
  const owner = (env.BANK_SYNC_USER_ID ?? '').trim()
  return owner !== '' && owner === userId && envCredentials(env) !== null
}

export interface ResolvedConnections {
  source: 'db' | 'env' | 'none'
  connections: BankCredentials[]
}

/**
 * Eigene Verbindungen, sonst die Env-Verbindung (nur fuer den Env-Nutzer), sonst nichts.
 * Hat der Nutzer EINE eigene Verbindung, verdraengt sie den Env-Fallback komplett.
 */
export function resolveFromRows(userId: string, rows: BankConnectionRow[], env: EnvLike): ResolvedConnections {
  if (rows.length > 0) {
    return { source: 'db', connections: rows.map(rowToCredentials) }
  }
  if (isEnvConnectionUser(userId, env)) {
    const c = envCredentials(env)
    if (c) return { source: 'env', connections: [c] }
  }
  return { source: 'none', connections: [] }
}
