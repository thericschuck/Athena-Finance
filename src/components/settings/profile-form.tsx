'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveProfile, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import type { UserProfile } from '@/lib/settings'

const TIMEZONES = [
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
]

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP']

const inputCls  = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

export function ProfileForm({ initialProfile }: { initialProfile: UserProfile }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, null)
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? '')

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Profil gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Profil</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Deine persönlichen Angaben</p>
      </div>

      <div className="space-y-4">
        {/* Display name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Anzeigename</label>
          <input
            name="display_name"
            defaultValue={initialProfile.display_name ?? ''}
            className={inputCls}
            placeholder="Dein Name"
          />
        </div>

        {/* Avatar URL + preview */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Avatar-URL</label>
          <div className="flex gap-3 items-center">
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-10 w-10 rounded-full object-cover border border-border"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <input
              name="avatar_url"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              className={inputCls}
              placeholder="https://..."
              type="url"
            />
          </div>
        </div>

        {/* Timezone */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Zeitzone</label>
          <select name="timezone" defaultValue={initialProfile.timezone} className={selectCls}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Basis-Währung</label>
          <select name="currency" defaultValue={initialProfile.currency} className={selectCls}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
