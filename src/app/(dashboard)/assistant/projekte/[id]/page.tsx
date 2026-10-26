import { notFound } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ladeProjekt } from '@/lib/assistant/projekte'
import { listeSessions } from '@/lib/assistant/sessions'
import { ProjektDetail } from '@/components/assistant/projekte/ProjektDetail'

export const dynamic = 'force-dynamic'
// Server Actions erben das Zeitlimit der Seite: `registerProjektDatei` lässt bei PDF und Bildern
// Haiku den Text auslesen, das dauert bei großen Dateien deutlich länger als ein Seitenaufruf.
export const maxDuration = 120

export default async function ProjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  // Keine UUID -> kein Treffer; die Abfrage würde sonst mit einem Typfehler der DB antworten.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()

  const [projekt, chats] = await Promise.all([
    ladeProjekt(supabase, user.id, id),
    listeSessions(supabase, user.id, id),
  ])
  if (!projekt) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl">
        <ProjektDetail projekt={projekt} chats={chats} />
      </div>
    </div>
  )
}
