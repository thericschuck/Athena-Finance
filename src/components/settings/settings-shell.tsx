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
    <div className="flex gap-8">
      {/* Sidebar nav */}
      <nav className="flex flex-col gap-0.5 w-44 shrink-0">
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
