import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { AiLogger } from '@/lib/assistant/logger'

export type DB = SupabaseClient<Database>

/**
 * Harte Obergrenze für zeilenbasierte Tools — unabhängig davon, was das
 * Modell anfragt (siehe Plan, "Zeilenbasierte Tools vs. Aggregat-Tools").
 * Kein Tool liest je mehr als das, egal welches `limit` im Input steht.
 */
export const ROW_CAP = 200

/**
 * Markiert Freitextfelder aus Nutzer-/Bank-/Fremdquellen als ausdrücklich
 * NICHT vertrauenswürdig, bevor sie ins Tool-Ergebnis (und damit in den
 * Modell-Kontext) wandern — siehe Plan, "Prompt-Injection — konkrete
 * Gegenmaßnahmen". `merchant`/`description`/`notes`/... können Text
 * enthalten, den eine Bank oder der Nutzer selbst eingetragen hat; das
 * Feld heißt danach `untrusted_<name>` statt z. B. nur `description`,
 * damit der System-Prompt darauf verweisen kann, ohne dass das Modell den
 * Unterschied zwischen "Anweisung" und "Daten" selbst erraten muss.
 */
export function untrust<T extends Record<string, unknown>>(row: T, fields: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const field of fields) {
    const key = String(field)
    if (key in out) {
      out[`untrusted_${key}`] = out[key]
      delete out[key]
    }
  }
  return out
}

export type AthenaToolOptions = {
  /** Für Speicher-Schreibzugriffe und Aktionsvorschläge: an welche Konversation
      und welche Antwort-Nachricht sie gehängt werden. */
  conversationId: string
  messageId: string
  logger: AiLogger
  /** Aus ai_settings: darf Athena von sich aus Fakten speichern? */
  autoMemory: boolean
  /** Aus ai_settings: sind Speicher-Werkzeuge überhaupt verfügbar? */
  memoryEnabled: boolean
}
