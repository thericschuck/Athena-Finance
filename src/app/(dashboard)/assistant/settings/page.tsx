import { createClient } from '@/lib/supabase/server'
import { getAthenaSettings } from '@/lib/assistant/settings'
import { PERSONA_TEMPLATES } from '@/lib/assistant/prompts'
import { AthenaSettingsForm } from '@/components/assistant/AthenaSettingsForm'

export const dynamic = 'force-dynamic'

export default async function AthenaSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const settings = await getAthenaSettings(supabase, user.id)

  // Kein `overflow-y-auto` mehr um das Formular: ab lg fuellt es die Hoehe und
  // scrollt nur in seiner linken Spalte bzw. im Textfeld. Ein Scroll-Container
  // hier wuerde die Hoehenbegrenzung aufheben und alles wieder lang machen.
  return (
    <div className="h-full min-h-0">
      {/* Die Vorlagentexte kommen als Props aus der Server-Komponente, nicht
          per Import im Client: so landen die ~8 KB Vorlagentext nur im Bundle
          dieser einen Seite. */}
      <AthenaSettingsForm settings={settings} templates={PERSONA_TEMPLATES} />
    </div>
  )
}
