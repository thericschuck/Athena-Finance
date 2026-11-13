/**
 * Bestaetigung einer von Athena vorgeschlagenen Schreibaktion, Statuswechsel inklusive (AUDIT.md A2).
 *
 * Ablauf: `pending` -> (atomar beanspruchen) `executing` -> Aktion ausfuehren -> `executed` oder `failed`.
 *
 * Warum beanspruchen: Frueher wechselte der Status erst NACH der Ausfuehrung (`pending -> executed`, bedingt auf `pending`).
 * Zwei gleichzeitige Bestaetigungen (Doppelklick, zwei Tabs, Wiederholung nach Timeout) lasen beide `pending` und fuehrten
 * beide aus. Das war bei idempotenten Aktionen (Kategorie setzen) harmlos, bei `executeRebalancing` nicht: das platziert echte
 * Kraken-Market-Orders, und ein Kauf-Leg wird doppelt gekauft. Jetzt gewinnt genau ein Aufruf: das Update
 * `... set status='executing' where id=... and status='pending' returning id` ist in Postgres atomar, der zweite Aufruf
 * bekommt 0 Zeilen zurueck und fuehrt NICHTS aus.
 *
 * Der Zwischenstatus `executing` sieht anders aus als `executed`: scheitert das Zurueckschreiben, steht die Karte nicht
 * faelschlich auf „Ausgefuehrt“ (der Fehler, den der alte Kommentar zu Recht fuerchtete).
 *
 * Bleibt eine Zeile auf `executing` (Prozess waehrend der Ausfuehrung abgestuerzt, Timeout der Function), wird sie NIE
 * automatisch erneut ausgefuehrt. Das ist Absicht: bei Kraken-Orders weiss man dann nicht, ob die Order raus ist. Sie
 * bleibt fuer eine manuelle Pruefung (`kraken_order_log`, Kraken-Konto) sichtbar.
 *
 * Reine Logik mit hereingereichten Abhaengigkeiten (Client, Ausfuehrung, Protokoll), damit sie ohne Next-Laufzeit und ohne
 * Kraken testbar ist (bestaetigung.test.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

type DB = SupabaseClient<Database>

export type BestaetigungErgebnis = { success: true; result: Record<string, unknown> } | { error: string }

export type BestaetigungAbhaengigkeiten = {
  supabase: DB
  userId: string
  actionId: string
  /** Ist der Aktionsname bekannt? Unbekannte Aktionen werden abgelehnt, OHNE den Status anzufassen. */
  istSchreibaktion: (name: string) => boolean
  /** Fuehrt die Aktion aus (in der App: `runWriteAction`). Wirft bei Fehlern. */
  fuehreAus: (action: string, input: unknown) => Promise<Record<string, unknown>>
  /** Schreibt ins System-Log (in der App: `logAi`, schluckt eigene Fehler). */
  protokoll: (eintrag: {
    level?: 'error'
    event: 'action.executed' | 'action.failed'
    message: string
    conversationId: string | null
    meta: Record<string, unknown>
  }) => Promise<void>
}

export const BEREITS_IN_ARBEIT = 'Vorschlag wird bereits ausgeführt oder wurde schon entschieden'

export async function bestaetigeVorschlag(d: BestaetigungAbhaengigkeiten): Promise<BestaetigungErgebnis> {
  const { supabase, userId, actionId } = d

  const { data: pending, error: loadError } = await supabase
    .from('ai_pending_actions')
    .select('id, action, input, summary, status, conversation_id')
    .eq('id', actionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (loadError) return { error: loadError.message }
  if (!pending) return { error: 'Vorschlag nicht gefunden' }
  // Nur fuer die verstaendliche Meldung. Die eigentliche Sperre ist das Beanspruchen unten: zwischen diesem Lesen und dem
  // Beanspruchen kann ein anderer Aufruf dazwischenkommen.
  if (pending.status !== 'pending') return { error: `Vorschlag ist bereits ${pending.status}` }
  if (!d.istSchreibaktion(pending.action)) return { error: `Unbekannte Aktion ${pending.action}` }

  // Atomar beanspruchen. Bei einem Fehler oder 0 Zeilen wird NICHT ausgefuehrt.
  const { data: beansprucht, error: claimError } = await supabase
    .from('ai_pending_actions')
    .update({ status: 'executing' })
    .eq('id', actionId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id')
  if (claimError) return { error: claimError.message }
  if (!beansprucht || beansprucht.length === 0) return { error: BEREITS_IN_ARBEIT }

  let result: Record<string, unknown>
  try {
    result = await d.fuehreAus(pending.action, pending.input)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const { data: markiert, error: failError } = await supabase
      .from('ai_pending_actions')
      .update({ status: 'failed', error: message, resolved_at: new Date().toISOString() })
      .eq('id', actionId)
      .eq('user_id', userId)
      .eq('status', 'executing')
      .select('id')
    await d.protokoll({
      level: 'error',
      event: 'action.failed',
      message: failError || !markiert?.length
        ? `${message} (Status konnte nicht auf failed gesetzt werden: ${failError?.message ?? 'keine Zeile getroffen'})`
        : message,
      conversationId: pending.conversation_id,
      meta: { actionId, action: pending.action },
    })
    return { error: message }
  }

  // Die Aktion ist gelaufen. Scheitert nur das Zurueckschreiben des Status, ist das KEIN Fehler der Aktion: der Aufrufer
  // bekommt Erfolg (sonst wuerde jemand die Aktion erneut anstossen), die Zeile bleibt auf `executing`, und der Vorfall steht
  // im Log.
  const { data: abgeschlossen, error: doneError } = await supabase
    .from('ai_pending_actions')
    .update({ status: 'executed', result: result as Json, resolved_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('user_id', userId)
    .eq('status', 'executing')
    .select('id')
  const statusFehler = doneError ? doneError.message : !abgeschlossen?.length ? 'keine Zeile getroffen' : null
  await d.protokoll({
    ...(statusFehler ? { level: 'error' as const } : {}),
    event: 'action.executed',
    message: statusFehler
      ? `${pending.summary} (Aktion ausgeführt, Status konnte nicht auf executed gesetzt werden: ${statusFehler})`
      : pending.summary,
    conversationId: pending.conversation_id,
    meta: { actionId, action: pending.action, result },
  })

  return { success: true, result }
}
