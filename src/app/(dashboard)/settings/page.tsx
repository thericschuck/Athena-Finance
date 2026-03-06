import { createClient } from '@/lib/supabase/server'
import { getProfile, getSettings } from '@/lib/settings'
import { SettingsShell } from '@/components/settings/settings-shell'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profile, settings] = await Promise.all([
    getProfile(user!.id),
    getSettings(user!.id),
  ])

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Einstellungen</h1>
      <SettingsShell
        initialProfile={profile ?? { id: user!.id, display_name: null, avatar_url: null, timezone: 'Europe/Berlin', currency: 'EUR' }}
        initialSettings={settings}
      />
    </div>
  )
}
