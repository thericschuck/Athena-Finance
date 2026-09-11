import { getAuthUser } from '@/lib/supabase/server'
import { getProfile, getSettings } from '@/lib/settings'
import { listWaitlistFor } from '@/lib/waitlist'
import { SettingsShell } from '@/components/settings/settings-shell'

export default async function SettingsPage() {
  const { supabase, user } = await getAuthUser()

  const [profile, settings, { data: accountRows }, waitlist] = await Promise.all([
    getProfile(user!.id),
    getSettings(user!.id),
    supabase
      .from('accounts')
      .select('id, name, color')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    // Liefert nur für den Eigentümer Zeilen, sonst null — und genau daran
    // entscheidet die Shell, ob es den Reiter überhaupt gibt (siehe
    // lib/waitlist.ts).
    listWaitlistFor(user!.id),
  ])

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Einstellungen</h1>
      <SettingsShell
        initialProfile={profile ?? { id: user!.id, display_name: null, avatar_url: null, timezone: 'Europe/Berlin', currency: 'EUR' }}
        initialSettings={settings}
        accounts={accountRows ?? []}
        email={user!.email ?? ''}
        waitlist={waitlist}
      />
    </div>
  )
}
