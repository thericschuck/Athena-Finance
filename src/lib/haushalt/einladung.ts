/**
 * Reiner Kern der Haushalts-Einladung (ohne next/supabase-Importe, damit er im node:test-Lauf ladbar ist).
 *
 * Token: 32 Zufallsbytes, base64url (43 Zeichen). In der Datenbank steht NUR der sha256-Hash (Hex); der Klartext
 * steht ausschliesslich im Link, den der Owner einmal sieht. Die Annahme sucht per Hash (Indexzugriff), ein
 * Zeitvergleich am Klartext findet nicht statt.
 */
import { createHash, randomBytes } from 'node:crypto'

export const TOKEN_BYTES = 32
export const EINLADUNG_GUELTIG_TAGE = 7
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function erzeugeToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Formcheck vor jedem Datenbankzugriff: Muell-Eingaben (falsche Laenge/Zeichen) erreichen die DB gar nicht. */
export function istTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export function normalisiereEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function einladungsLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/einladung/${token}`
}

export type AnnahmeFehler = 'ungueltig' | 'anderer_haushalt' | 'iban_konflikt' | 'unbekannt'

/**
 * Uebersetzt die Fehlermeldung aus fn_accept_household_invite. Alle Token-Probleme (unbekannt, abgelaufen, benutzt,
 * falsche E-Mail) sind EIN Code, damit Unbefugte nicht erfahren, ob ein Token existiert.
 */
export function mappeAnnahmeFehler(message: string | null | undefined): AnnahmeFehler {
  const m = message ?? ''
  if (m.includes('already_in_other_household')) return 'anderer_haushalt'
  if (m.includes('iban_conflict')) return 'iban_konflikt'
  if (m.includes('invite_invalid')) return 'ungueltig'
  return 'unbekannt'
}

export const ANNAHME_FEHLER_TEXT: Record<AnnahmeFehler, string> = {
  ungueltig: 'Diese Einladung ist ungültig, abgelaufen oder gehört zu einer anderen E-Mail-Adresse.',
  anderer_haushalt: 'Dein Konto gehört schon zu einem anderen Haushalt. Ein Konto kann nur in einem Haushalt sein.',
  iban_konflikt: 'Ein Bankkonto (IBAN) deines Kontos ist im Haushalt schon bei einem Mitglied verknüpft. Bitte entferne die Verknüpfung in deinen Einstellungen oder sprich mit dem Owner, bevor du beitrittst.',
  unbekannt: 'Die Einladung konnte nicht angenommen werden. Bitte versuche es später noch einmal.',
}

/** Anzeigename aus der Eingabe: getrimmt, ohne Steuerzeichen, max. 60 Zeichen. */
export function bereinigeName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
}
