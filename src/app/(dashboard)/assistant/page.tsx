import { getAuthUser } from '@/lib/supabase/server'
import { AthenaChat } from '@/components/assistant/AthenaChat'
import { SessionList } from '@/components/assistant/SessionList'
import { ladeSessionZustand, listeSessions, type SessionZustand } from '@/lib/assistant/sessions'

// Sessions und Nachrichten ändern sich bei jedem Chat-Zug — statisches Caching
// würde hier immer die vorletzte Konversation zeigen.
export const dynamic = 'force-dynamic'

export default async function AthenaChatPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>
}) {
  const [{ s: activeId }, { supabase, user }] = await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  // Beides parallel: die Session-Liste hängt nicht am Verlauf der offenen Session.
  const [sessions, zustand] = await Promise.all([
    listeSessions(supabase, user.id),
    activeId
      ? ladeSessionZustand(supabase, user.id, activeId)
      : Promise.resolve(undefined as SessionZustand | undefined),
  ])

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 rounded-lg border border-border lg:block">
        <SessionList sessions={sessions} activeId={activeId} />
      </aside>
      <div className="min-h-0 overflow-hidden rounded-lg border border-border">
        <AthenaChat
          // Der Key erzwingt beim Wechsel der Session einen frischen Mount —
          // der Chat übernimmt `initialMessages` sonst nur beim ersten Rendern.
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={zustand?.messages}
          actionStatuses={zustand?.actionStatuses}
          actionResults={zustand?.actionResults}
          backdrop
        />
      </div>
    </div>
  )
}
