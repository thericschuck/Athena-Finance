'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { saveProfile, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import type { UserProfile } from '@/lib/settings'
import { Camera, X } from 'lucide-react'

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

function getInitials(name: string | null, email: string): string {
  const src = name?.trim() || email
  return src.slice(0, 2).toUpperCase()
}

export function ProfileForm({ initialProfile, email }: { initialProfile: UserProfile; email: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialProfile.avatar_url ?? null)
  const [hasNewFile, setHasNewFile] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) {
      toast.success('Profil gespeichert')
      setHasNewFile(false)
    }
    if ('error' in state) toast.error(state.error)
  }, [state])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setHasNewFile(true)
  }

  function handleRemoveAvatar() {
    setPreviewUrl(null)
    setHasNewFile(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Profil</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Deine persönlichen Angaben</p>
      </div>

      <div className="space-y-4">
        {/* Avatar upload */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Profilbild</label>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Avatar"
                  className="size-16 rounded-full object-cover border-2 border-border"
                  onError={() => setPreviewUrl(null)}
                />
              ) : (
                <div className="size-16 rounded-full bg-muted border-2 border-border flex items-center justify-center text-lg font-semibold text-muted-foreground select-none">
                  {getInitials(initialProfile.display_name, email)}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                aria-label="Bild ändern"
              >
                <Camera className="size-5 text-white" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Bild hochladen
              </Button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="size-3" /> Entfernen
                </button>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP</p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            name="avatar_file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            type="hidden"
            name="avatar_url"
            value={!hasNewFile ? (previewUrl ?? '') : ''}
          />
        </div>

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
