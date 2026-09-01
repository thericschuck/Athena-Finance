import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

type DB = SupabaseClient<Database>

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Bekannte Ereignisse im System-Log. Als Union statt freier Strings, damit die
 * Filter-Leiste in der Log-Ansicht eine feste Liste hat und ein Tippfehler im
 * Event-Namen nicht stillschweigend eine neue "Kategorie" erzeugt.
 */
export type LogEvent =
  | 'run.start'          // ein Athena-Lauf beginnt
  | 'run.finish'         // Lauf regulär beendet (mit Kosten/Schrittzahl)
  | 'run.error'          // Lauf abgebrochen
  | 'run.limit'          // Tageslimit oder Schrittlimit erreicht
  | 'step.finish'        // ein Modellschritt inkl. Werkzeugaufrufen
  | 'tool.error'         // ein Werkzeug hat einen Fehler zurückgegeben
  | 'memory.write'       // Athena hat einen Fakt gespeichert/aktualisiert
  | 'memory.delete'
  | 'knowledge.write'    // Wissensbasis-Eintrag angelegt/geändert
  | 'knowledge.delete'
  | 'action.proposed'    // schreibende Aktion vorgeschlagen
  | 'action.executed'
  | 'action.rejected'
  | 'action.failed'
  | 'session.create'
  | 'session.rename'
  | 'session.delete'
  | 'web.search'         // Web-Recherche durchgeführt

type LogInput = {
  level?: LogLevel
  event: LogEvent
  message?: string
  meta?: Record<string, unknown>
  conversationId?: string | null
  durationMs?: number | null
}

/**
 * Schreibt eine Zeile ins System-Log.
 *
 * Bewusst „fire and forget" mit verschlucktem Fehler: das Log ist Diagnose,
 * kein Geschäftsvorfall. Ein fehlgeschlagener Log-Insert (RLS, Netz, Timeout)
 * darf niemals eine laufende Athena-Antwort oder eine bestätigte Schreibaktion
 * zum Scheitern bringen. Fehler landen stattdessen in der Server-Konsole.
 */
export async function logAi(supabase: DB, userId: string, input: LogInput): Promise<void> {
  try {
    const { error } = await supabase.from('ai_logs').insert({
      user_id: userId,
      conversation_id: input.conversationId ?? null,
      level: input.level ?? 'info',
      event: input.event,
      message: input.message ?? null,
      meta: (input.meta ?? null) as Json,
      duration_ms: input.durationMs ?? null,
    })
    if (error) console.error('[ai_logs]', input.event, error.message)
  } catch (err) {
    console.error('[ai_logs]', input.event, err)
  }
}

/** Bequeme Variante, die `userId`/`conversationId` einmal bindet. */
export function createLogger(supabase: DB, userId: string, conversationId?: string | null) {
  return (input: Omit<LogInput, 'conversationId'> & { conversationId?: string | null }) =>
    logAi(supabase, userId, { conversationId, ...input })
}

export type AiLogger = ReturnType<typeof createLogger>
