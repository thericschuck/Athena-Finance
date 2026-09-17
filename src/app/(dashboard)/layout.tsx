import { getAuthUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getProfile, getSettings } from '@/lib/settings'
import { getAthenaSettings } from '@/lib/assistant/settings'
import { SettingsProvider } from '@/components/providers/settings-context'
import { AthenaSettingsProvider } from '@/components/providers/athena-settings-context'
import { PrivacyProvider } from '@/components/providers/privacy-context'

/**
 * Gilt für alle Server Actions, die unter diesem Layout ausgelöst werden — und eine davon
 * dauert lange: `confirmPendingAction` mit `generateValuableArtwork` wartet auf einen
 * Bildlauf bei OpenAI (15–60 s, im schlechten Fall mehr). Auf der Voreinstellung würde die
 * Bestätigung mitten im Lauf abgeschnitten, das Bild wäre erzeugt und bezahlt, die Karte
 * meldete trotzdem einen Fehler.
 *
 * Das Limit ist eine Obergrenze, keine reservierte Zeit: abgerechnet wird, was tatsächlich
 * läuft, alle übrigen Aktionen bleiben so kurz wie bisher. Athenas Chat-Route hat aus
 * demselben Grund ihr eigenes, höheres Limit (api/assistant/route.ts).
 */
export const maxDuration = 120

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { supabase, user } = await getAuthUser()

  if (!user) {
    redirect('/login')
  }

  const [profile, settings, athenaSettings] = await Promise.all([
    getProfile(user.id),
    getSettings(user.id),
    getAthenaSettings(supabase, user.id),
  ])

  return (
    <SettingsProvider settings={settings} currency={profile?.currency ?? 'EUR'}>
      <AthenaSettingsProvider initial={{ model: athenaSettings.model, effort: athenaSettings.effort }}>
        <PrivacyProvider>
          <AppShell
            email={user.email ?? ''}
            displayName={profile?.display_name ?? null}
            avatarUrl={profile?.avatar_url ?? null}
          >
            {children}
          </AppShell>
        </PrivacyProvider>
      </AthenaSettingsProvider>
    </SettingsProvider>
  )
}
