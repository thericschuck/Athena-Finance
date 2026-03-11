'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { UserProfile, SettingsMap } from '@/lib/settings'
import { ProfileForm }       from './profile-form'
import { AppearanceForm }    from './appearance-form'
import { FinanceForm }       from './finance-form'
import { TradingForm }       from './trading-form'
import { NotificationsForm } from './notifications-form'

const TABS = [
  { id: 'profil',         label: 'Profil' },
  { id: 'darstellung',    label: 'Darstellung' },
  { id: 'finanzen',       label: 'Finanzen' },
  { id: 'trading',        label: 'Trading' },
  { id: 'benachrichtigungen', label: 'Benachrichtigungen' },
] as const

type TabId = typeof TABS[number]['id']

export function SettingsShell({
  initialProfile,
  initialSettings,
  email,
}: {
  initialProfile: UserProfile
  initialSettings: SettingsMap
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
                ? 'bg-accent text-accent-foreground font-medium'
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
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {active === 'profil'             && <ProfileForm       initialProfile={initialProfile} email={email} />}
        {active === 'darstellung'        && <AppearanceForm    initialSettings={initialSettings} />}
        {active === 'finanzen'           && <FinanceForm       initialSettings={initialSettings} />}
        {active === 'trading'            && <TradingForm       initialSettings={initialSettings} />}
        {active === 'benachrichtigungen' && <NotificationsForm initialSettings={initialSettings} />}
      </div>
    </div>
  )
}
