import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { getOwnProfile } from '@/lib/haushalt/resolve'
import { getActiveAccountOptions } from '@/lib/data/overview'
import { listWaitlistFor } from '@/lib/waitlist'
import { SettingsShell } from '@/components/settings/settings-shell'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { supabase, user } = await requireAuthUser()
  // Direktlink auf einen Reiter, z. B. /settings?tab=integrationen (Checkliste "Erste Schritte"). Unbekannte Werte
  // werden in der Shell ignoriert (Start auf "Profil").
  const tabParam = (await searchParams).tab
  const initialTab = Array.isArray(tabParam) ? tabParam[0] : tabParam

  const [profile, settings, accountRows, waitlist] = await Promise.all([
    getOwnProfile(supabase, user!.id),
    getSettings(user!.id),
    getActiveAccountOptions(supabase, user!.id),
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
        accounts={accountRows}
        email={user!.email ?? ''}
        waitlist={waitlist}
        initialTab={initialTab}
      />
    </div>
  )
}
