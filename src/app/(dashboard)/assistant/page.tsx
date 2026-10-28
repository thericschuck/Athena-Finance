import { getAuthUser } from '@/lib/supabase/server'
import { AthenaChat } from '@/components/assistant/AthenaChat'
import { SessionList } from '@/components/assistant/SessionList'
import { SessionLeiste } from '@/components/assistant/SessionLeiste'
import { hinweisEntwurf } from '@/lib/assistant/hinweis-entwurf'
import { loadAnzeigeNameFuerNutzer } from '@/lib/assistant/context'
import { kennenlernPrompt } from '@/lib/assistant/starter'
import { listeProjekte } from '@/lib/assistant/projekte'
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
  searchParams: Promise<{ s?: string; p?: string; projekt?: string; hinweis?: string; start?: string }>
}) {
  const [{ s: activeId, p: neuInProjekt, projekt: filterRoh, hinweis: hinweisId, start }, { supabase, user }] =
    await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  // Beides parallel: die Session-Liste hängt nicht am Verlauf der offenen Session.
  const [alleSessions, projekteZeilen, zustand, kosten, aktiveZeile] = await Promise.all([
    listeSessions(supabase, user.id),
    listeProjekte(supabase, user.id),
    activeId
      ? ladeSessionZustand(supabase, user.id, activeId)
      : Promise.resolve(undefined as SessionZustand | undefined),
    activeId
      ? ladeSessionKosten(supabase, user.id, activeId)
      : Promise.resolve(undefined as SessionKosten | undefined),
    // Projekt der offenen Session (die Liste kann gefiltert sein und sie nicht enthalten).
    activeId
      ? supabase
          .from('ai_conversations')
          .select('project_id')
          .eq('id', activeId)
          .eq('user_id', user.id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ])

  const projekte = projekteZeilen.map((p) => ({ id: p.id, name: p.name }))
  const projektNamen = new Map(projekte.map((p) => [p.id, p.name]))

  // `?p=` zählt nur für einen NEUEN Chat (es gibt noch keine Zeile) und nur für eigene Projekte;
  // bei einer bestehenden Session entscheidet die Zeile.
  const neuesProjekt = !aktiveZeile && neuInProjekt && projektNamen.has(neuInProjekt) ? neuInProjekt : null
  const aktivesProjektId = aktiveZeile ? aktiveZeile.project_id : neuesProjekt
  const aktivesProjekt = aktivesProjektId
    ? { id: aktivesProjektId, name: projektNamen.get(aktivesProjektId) ?? 'Projekt' }
    : null

  // Filter der Seitenleiste: eine eigene Projekt-ID oder „ohne“ (nur allgemeine Chats).
  const projektFilter =
    filterRoh === 'ohne' || (filterRoh && projektNamen.has(filterRoh)) ? filterRoh : undefined
  // Mit Filter direkt über die ganze Historie fragen: ein Filter auf den 50 neuesten Sessions im
  // Speicher würde ältere Projekt-Chats verschweigen.
  const sessions = projektFilter ? await listeSessions(supabase, user.id, projektFilter) : alleSessions

  // „Im Chat“ an einem Dashboard-Hinweis: nur für einen NEUEN Chat. Der Hinweis wird geladen (eigene
  // Zeile, user_id gefiltert) und als fertiger, editierbarer Prompt ins Eingabefeld gelegt — gesendet
  // wird erst auf Klick, damit nichts still Kosten verursacht.
  let entwurf: string | undefined
  if (!activeId && hinweisId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hinweisId)) {
    const { data: hinweis } = await supabase
      .from('insights')
      .select('title, body, type, severity')
      .eq('id', hinweisId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (hinweis) entwurf = hinweisEntwurf(hinweis)
  }
  // Deep-Link `?start=kennenlernen` (Checkliste „Erste Schritte“): der Kennenlern-Prompt liegt vorbefüllt und
  // editierbar im Eingabefeld, auch in einem bestehenden Chat; gesendet wird erst auf Klick.
  if (!entwurf && start === 'kennenlernen') entwurf = kennenlernPrompt(await loadAnzeigeNameFuerNutzer(supabase, user.id))

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden min-h-0 rounded-lg border border-border lg:block">
        <SessionList
          sessions={sessions}
          activeId={activeId}
          projekte={projekte}
          projektFilter={projektFilter}
        />
      </aside>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <SessionLeiste
          sessions={alleSessions}
          projekt={aktivesProjekt}
          projekte={projekte}
          activeId={activeId}
          kosten={kosten && kosten.laeufe > 0 ? kosten : null}
        />
        <AthenaChat
          // Der Key erzwingt beim Wechsel der Session einen frischen Mount —
          // der Chat übernimmt `initialMessages` sonst nur beim ersten Rendern.
          key={activeId ?? 'new'}
          conversationId={activeId}
          projectId={neuesProjekt ?? undefined}
          initialInput={entwurf}
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
