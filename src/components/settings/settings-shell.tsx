'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { UserProfile, SettingsMap } from '@/lib/settings'
import { ProfileForm }       from './profile-form'
import { AppearanceForm }    from './appearance-form'
import { FinanceForm }       from './finance-form'
import { AnalyseForm, type AnalyseFormAccount } from './analyse-form'
import { TradingForm }       from './trading-form'
import { IntegrationsForm }  from './integrations-form'

const TABS = [
  { id: 'profil',         label: 'Profil' },
  { id: 'darstellung',    label: 'Darstellung' },
  { id: 'finanzen',       label: 'Finanzen' },
  { id: 'analyse',        label: 'Analyse' },
  { id: 'trading',        label: 'Trading' },
  { id: 'integrationen',  label: 'Integrationen' },
] as const

type TabId = typeof TABS[number]['id']

export function SettingsShell({
  initialProfile,
  initialSettings,
  accounts,
  email,
}: {
  initialProfile: UserProfile
  initialSettings: SettingsMap
  accounts: AnalyseFormAccount[]
  email: string
}) {
  const [active, setActive] = useState<TabId>('profil')

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      {/* Mobile: horizontal scrollable tab strip */}
      <nav className="flex overflow-x-auto gap-1 border-b border-border pb-1 -mx-4 px-4 sm:hidden shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'whitespace-nowrap px-3 py-2 rounded-md text-sm transition-colors shrink-0',
              active === tab.id
                // hover:text-foreground statt hover:text-accent-foreground (das wäre schon die
                // Ruhefarbe) — auf Themes mit dunklem accent-foreground (z. B. Athena) sonst kaum
                // wahrnehmbarer Hover auf dem eh schon aktiven Tab.
                ? 'bg-accent text-accent-foreground font-medium hover:text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Desktop: vertical sidebar nav */}
      <nav className="hidden sm:flex flex-col gap-0.5 w-44 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'text-left px-3 py-2 rounded-md text-sm transition-colors',
              active === tab.id
                // hover:text-foreground statt hover:text-accent-foreground (das wäre schon die
                // Ruhefarbe) — auf Themes mit dunklem accent-foreground (z. B. Athena) sonst kaum
                // wahrnehmbarer Hover auf dem eh schon aktiven Tab.
                ? 'bg-accent text-accent-foreground font-medium hover:text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {active === 'profil'        && <ProfileForm       initialProfile={initialProfile} email={email} />}
        {active === 'darstellung'   && <AppearanceForm   initialSettings={initialSettings} />}
        {active === 'finanzen'      && <FinanceForm       initialSettings={initialSettings} />}
        {active === 'analyse'       && <AnalyseForm       initialSettings={initialSettings} accounts={accounts} />}
        {active === 'trading'       && <TradingForm       initialSettings={initialSettings} />}
        {active === 'integrationen' && <IntegrationsForm />}
      </div>
    </div>
  )
}
