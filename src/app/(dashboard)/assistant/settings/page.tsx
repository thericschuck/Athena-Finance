import { getAuthUser } from '@/lib/supabase/server'
import { getAthenaSettings } from '@/lib/assistant/settings'
import { PERSONA_TEMPLATES } from '@/lib/assistant/prompts'
import { AthenaSettingsForm } from '@/components/assistant/AthenaSettingsForm'

export const dynamic = 'force-dynamic'

export default async function AthenaSettingsPage() {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const settings = await getAthenaSettings(supabase, user.id)

  // Der Wrapper scrollt im verfügbaren Raum (Eltern-Container ist `min-h-0
  // flex-1`); das Formular ist einfach ein normal hoher Block. Die Speicherleiste
  // haftet darin unten – bewusst ohne Padding am Wrapper, das ließe unter der Leiste einen Streifen stehen.
  return (
    <div className="h-full overflow-y-auto">
      {/* Die Vorlagentexte kommen als Props aus der Server-Komponente, nicht
          per Import im Client: so landen die ~8 KB Vorlagentext nur im Bundle
          dieser einen Seite. */}
      <AthenaSettingsForm settings={settings} templates={PERSONA_TEMPLATES} />
    </div>
  )
}
