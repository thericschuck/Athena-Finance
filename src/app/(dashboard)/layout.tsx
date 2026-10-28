import { getAuthUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { PERF_ENABLED, logRender, perfRequestInfo } from '@/lib/perf/perf-log'
import { AppShell } from '@/components/layout/app-shell'
import { getSettings } from '@/lib/settings'
import { getAthenaModelEffort } from '@/lib/assistant/settings'
import { SettingsProvider } from '@/components/providers/settings-context'
import { AthenaSettingsProvider } from '@/components/providers/athena-settings-context'
import { PrivacyProvider } from '@/components/providers/privacy-context'
import { HaushaltProvider } from '@/components/providers/haushalt-context'
import { NutzerProvider } from '@/components/providers/nutzer-context'
import { anzeigeName } from '@/lib/assistant/nutzername'
import { getOwnProfile, resolveScope } from '@/lib/haushalt/resolve'

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
  // Nur bei PERF_LOG=1: Gesamtdauer des Renders protokollieren (nach dem Senden der Antwort).
  if (PERF_ENABLED) {
    const info = await perfRequestInfo()
    const startedAt = Date.now()
    after(() => logRender(info, startedAt))
  }

  const { supabase, user } = await getAuthUser()

  if (!user) {
    redirect('/login')
  }

  const [profile, settings, athenaSettings, scopeCtx, ausgangslage] = await Promise.all([
    getOwnProfile(supabase, user.id),
    getSettings(user.id),
    getAthenaModelEffort(supabase, user.id),
    resolveScope(supabase, user),
    // Nur zählen (kein Inhalt): gibt es schon Ziele/Fakten/Randbedingungen/Vorlieben im Athena-Gedächtnis?
    supabase
      .from('ai_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('source', ['agent', 'user'])
      .in('category', ['goal', 'fact', 'constraint', 'preference']),
  ])
  const partnerName = scopeCtx.members.find(m => m.id === scopeCtx.partnerId)?.name ?? null
  const ownName = scopeCtx.members.find(m => m.id === user.id)?.name ?? profile?.display_name ?? null

  return (
    <SettingsProvider settings={settings} currency={profile?.currency ?? 'EUR'}>
      <AthenaSettingsProvider initial={{ model: athenaSettings.model, effort: athenaSettings.effort }}>
        <PrivacyProvider>
          <HaushaltProvider canShare={scopeCtx.available.length > 1}>
          <NutzerProvider name={anzeigeName(ownName)} hatAusgangslage={(ausgangslage.count ?? 0) > 0}>
          <AppShell
            email={user.email ?? ''}
            displayName={profile?.display_name ?? null}
            avatarUrl={profile?.avatar_url ?? null}
            scope={{ available: scopeCtx.available, active: scopeCtx.scope, ownName, partnerName }}
          >
            {children}
          </AppShell>
          </NutzerProvider>
          </HaushaltProvider>
        </PrivacyProvider>
      </AthenaSettingsProvider>
    </SettingsProvider>
  )
}
