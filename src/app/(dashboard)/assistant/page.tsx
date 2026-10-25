import { getAuthUser } from '@/lib/supabase/server'
import { AthenaChat } from '@/components/assistant/AthenaChat'
import { SessionList } from '@/components/assistant/SessionList'
import { SessionLeiste } from '@/components/assistant/SessionLeiste'
import {
  ladeSessionKosten,
  ladeSessionZustand,
  listeSessions,
  type SessionKosten,
  type SessionZustand,
} from '@/lib/assistant/sessions'

// Sessions und Nachrichten ändern sich bei jedem Chat-Zug — statisches Caching
// würde hier immer die vorletzte Konversation zeigen.
export const dynamic = 'force-dynamic'
// Server Actions erben das Zeitlimit der Seite: der Bank-Sync (Aktion syncBank) kann auf eine
// Freigabe in der SecureGo-plus-App warten.
export const maxDuration = 300

export default async function AthenaChatPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>
}) {
  const [{ s: activeId }, { supabase, user }] = await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  // Beides parallel: die Session-Liste hängt nicht am Verlauf der offenen Session.
  const [sessions, zustand, kosten] = await Promise.all([
    listeSessions(supabase, user.id),
    activeId
      ? ladeSessionZustand(supabase, user.id, activeId)
      : Promise.resolve(undefined as SessionZustand | undefined),
    activeId
      ? ladeSessionKosten(supabase, user.id, activeId)
      : Promise.resolve(undefined as SessionKosten | undefined),
  ])

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 rounded-lg border border-border lg:block">
        <SessionList sessions={sessions} activeId={activeId} />
      </aside>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <SessionLeiste
          sessions={sessions}
          activeId={activeId}
          kosten={kosten && kosten.laeufe > 0 ? kosten : null}
        />
        <AthenaChat
          // Der Key erzwingt beim Wechsel der Session einen frischen Mount —
          // der Chat übernimmt `initialMessages` sonst nur beim ersten Rendern.
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={zustand?.messages}
          actionStatuses={zustand?.actionStatuses}
          actionResults={zustand?.actionResults}
          backdrop
          className="flex-1"
        />
      </div>
    </div>
  )
}
