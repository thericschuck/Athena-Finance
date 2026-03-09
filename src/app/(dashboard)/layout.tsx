import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getProfile, getSettings } from '@/lib/settings'
import { SettingsApplier } from '@/components/layout/settings-applier'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [profile, settings] = await Promise.all([
    getProfile(user.id),
    getSettings(user.id),
  ])

  return (
    <>
      <SettingsApplier settings={settings} />
      <AppShell
        email={user.email ?? ''}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
      >
        {children}
      </AppShell>
    </>
  )
}
