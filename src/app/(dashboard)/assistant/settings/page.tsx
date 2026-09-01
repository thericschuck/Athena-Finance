import { createClient } from '@/lib/supabase/server'
import { getAthenaSettings } from '@/lib/assistant/settings'
import { AthenaSettingsForm } from '@/components/assistant/AthenaSettingsForm'

export const dynamic = 'force-dynamic'

export default async function AthenaSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const settings = await getAthenaSettings(supabase, user.id)

  return (
    <div className="h-full overflow-y-auto">
      <AthenaSettingsForm settings={settings} />
    </div>
  )
}
