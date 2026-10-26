import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'
import type { Database } from '@/types/database'
import type { PendingActionStatus } from '@/components/assistant/PendingActionCard'
import { berlinTagNummer } from '@/lib/assistant/session-gruppen'
import { estimateCostUsd, type UsageLike } from '@/lib/assistant/cost'

/**
 * Sessions lesen und wiederherstellen — der gemeinsame Kern.
 *
 * Lag vorher komplett in `(dashboard)/assistant/page.tsx`. Herausgezogen, weil es jetzt zwei
 * Aufrufer gibt: die volle Seite (Server Component) und das schwebende Sheet, das seine
 * Sessions über Server Actions nachlädt. Eine zweite Kopie der Wiederherstellungsregeln
 * wäre der sichere Weg zu zwei Chats, die denselben Verlauf unterschiedlich anzeigen.
 *
 * Der Supabase-Client kommt als Parameter herein und wird hier NICHT importiert: das Modul
 * exportiert auch `relativeDay`, und das braucht ein Client Component. Ein Import von
 * `@/lib/supabase/server` würde den Server-Client mit in das Browser-Bundle ziehen.
 */

type DB = SupabaseClient<Database>

/** Mehr Sessions als das passt niemand durch, und die Liste bleibt eine Abfrage. */
const SESSION_LIMIT = 50

export type SessionSummary = {
  id: string
  title: string | null
  pinned: boolean
  updatedAt: string
  messageCount: number
  /** Projekt, zu dem der Chat gehört; `null` = allgemeiner Chat. */
  projectId: string | null
}

/** Alles, was ein Chat braucht, um eine gespeicherte Session weiterzuführen. */
export type SessionZustand = {
  messages: UIMessage[]
  /** Status der Vorschläge, damit entschiedene Karten nicht wieder als offen erscheinen. */
  actionStatuses: Record<string, PendingActionStatus>
  /** Rückgaben ausgeführter Vorschläge (bisher nur das Artwork der Inventar-Aktion). */
  actionResults: Record<string, unknown>
}

/** Datumsangabe in der Session-Liste. Nah dran relativ, weiter weg als Datum. */
export function relativeDay(iso: string): string {
  const date = new Date(iso)
  // Berliner Kalendertage, nicht lokale: gleiches Ergebnis auf Server (UTC) und im Browser.
  const days = berlinTagNummer(new Date()) - berlinTagNummer(date)
  if (days <= 0) return 'Heute'
  if (days === 1) return 'Gestern'
  if (days < 7) return `vor ${days} Tagen`
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Europe/Berlin',
  })
}

/**
 * Die Sessions eines Nutzers, angeheftete zuerst.
 *
 * Zählung der Nachrichten über das eingebettete Aggregat statt über eine eigene View:
 * PostgREST liefert `count` pro Relation mit, und eine View dafür wäre mehr Migration als
 * Nutzen.
 */
export async function listeSessions(
  supabase: DB,
  userId: string,
  /** Nur Chats dieses Projekts (`'ohne'` = nur allgemeine Chats). */
  projekt?: string,
): Promise<SessionSummary[]> {
  let abfrage = supabase
    .from('ai_conversations')
    .select('id, title, pinned, updated_at, project_id, ai_messages(count)')
    .eq('user_id', userId)
    .is('archived_at', null)
  if (projekt === 'ohne') abfrage = abfrage.is('project_id', null)
  else if (projekt) abfrage = abfrage.eq('project_id', projekt)
  const { data } = await abfrage
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(SESSION_LIMIT)

  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    pinned: c.pinned,
    updatedAt: c.updated_at,
    projectId: c.project_id,
    messageCount: (c.ai_messages as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

/**
 * Entscheidet, ob eine gespeicherte Nachricht in den Chat zurückgeladen werden kann. Zwei
 * Fälle fallen hier heraus:
 *
 *  - Leere Platzhalter: die Antwort-Zeile wird angelegt, bevor die Antwort feststeht (siehe
 *    api/assistant/route.ts). Bricht der Lauf vorher ab, bleibt `[]` stehen.
 *  - Nachrichten aus der Zeit vor Athena: dort lagen in `content` die ModelMessages der
 *    AI-SDK (`{role, content}`) statt der UI-Parts. Die haben kein `type`-Feld und würden
 *    als leere Sprechblase gerendert.
 */
function isRestorableMessage(row: { content: unknown }): boolean {
  return (
    Array.isArray(row.content) &&
    row.content.length > 0 &&
    row.content.every(
      (part) =>
        typeof part === 'object' &&
        part !== null &&
        typeof (part as { type?: unknown }).type === 'string',
    )
  )
}

/**
 * Lädt Nachrichten und Vorschlagszustand einer Session.
 *
 * Gibt für eine unbekannte oder fremde ID einen leeren Zustand zurück statt zu werfen: die
 * ID kommt aus dem Client (Link-Parameter, Session-Umschalter im Sheet), und ein leerer
 * Chat ist dort die harmlosere Antwort. Fremde Daten kann sie ohnehin nicht öffnen — die
 * Abfragen filtern auf `user_id`, zusätzlich zur RLS.
 */
export async function ladeSessionZustand(
  supabase: DB,
  userId: string,
  conversationId: string,
): Promise<SessionZustand> {
  const [{ data: rows }, { data: pending }] = await Promise.all([
    supabase
      .from('ai_messages')
      .select('id, role, content')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true }),
    supabase
      .from('ai_pending_actions')
      .select('id, status, result')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId),
  ])

  return {
    messages: (rows ?? []).filter(isRestorableMessage).map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      parts: row.content as unknown as UIMessage['parts'],
    })),
    actionStatuses: Object.fromEntries(
      (pending ?? []).map((p) => [p.id, p.status as PendingActionStatus]),
    ),
    actionResults: Object.fromEntries(
      (pending ?? []).filter((p) => p.result != null).map((p) => [p.id, p.result]),
    ),
  }
}

/** Geschätzte Kosten und Anzahl der Läufe einer Session, aus den `run.finish`-Logs. */
export type SessionKosten = { usd: number; laeufe: number }

export async function ladeSessionKosten(
  supabase: DB,
  userId: string,
  conversationId: string,
): Promise<SessionKosten> {
  const { data } = await supabase
    .from('ai_logs')
    .select('meta')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('event', 'run.finish')
  const laeufe = data ?? []
  const usd = laeufe.reduce((summe, row) => {
    const meta = row.meta as { model?: string; usage?: UsageLike } | null
    return summe + (estimateCostUsd(meta?.model ?? null, meta?.usage ?? null) ?? 0)
  }, 0)
  return { usd, laeufe: laeufe.length }
}
