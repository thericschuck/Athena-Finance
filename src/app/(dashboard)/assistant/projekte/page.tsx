import { getAuthUser } from '@/lib/supabase/server'
import { listeProjekte } from '@/lib/assistant/projekte'
import { ProjektListe } from '@/components/assistant/projekte/ProjektListe'

export const dynamic = 'force-dynamic'

export default async function ProjektePage() {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const projekte = await listeProjekte(supabase, user.id)

  // Der Wrapper scrollt im verfügbaren Raum (Eltern ist `min-h-0 flex-1`), ohne eigene Höhen-Tricks.
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl">
        <ProjektListe projekte={projekte} />
      </div>
    </div>
  )
}
