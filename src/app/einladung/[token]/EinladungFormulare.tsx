'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { angemeldetAnnehmen, anmeldenUndAnnehmen, neuesKontoAnnehmen, type EinladungState } from './actions'

const FELD = 'h-10 text-base sm:h-9 sm:text-sm'

function Fehler({ state }: { state: EinladungState }) {
  return state && 'error' in state ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null
}

function Senden({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="h-10 w-full sm:h-9">
      {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
      {children}
    </Button>
  )
}

export function EinladungFormulare({ token, email, angemeldet }: { token: string; email: string; angemeldet: boolean }) {
  const [modus, setModus] = useState<'neu' | 'login'>('neu')
  const [neuState, neuAction, neuPending] = useActionState(neuesKontoAnnehmen, null)
  const [loginState, loginAction, loginPending] = useActionState(anmeldenUndAnnehmen, null)
  const [accState, accAction, accPending] = useActionState(angemeldetAnnehmen, null)

  if (angemeldet) {
    return (
      <form action={accAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <Fehler state={accState} />
        <Senden pending={accPending}>Einladung annehmen</Senden>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm" role="tablist">
        {([['neu', 'Neues Konto'], ['login', 'Ich habe ein Konto']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={modus === id}
            onClick={() => setModus(id)}
            className={cn('rounded px-2 py-1.5 transition-colors', modus === id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {modus === 'neu' ? (
        <form action={neuAction} className="space-y-3" autoComplete="off">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label htmlFor="e-mail">E-Mail</Label>
            <Input id="e-mail" value={email} readOnly className={FELD} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Anzeigename</Label>
            <Input id="e-name" name="name" maxLength={60} required autoComplete="name" className={FELD} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-pw">Passwort (mindestens 10 Zeichen)</Label>
            <Input id="e-pw" name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password" className={FELD} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-pw2">Passwort wiederholen</Label>
            <Input id="e-pw2" name="password2" type="password" minLength={10} maxLength={128} required autoComplete="new-password" className={FELD} />
          </div>
          <Fehler state={neuState} />
          <Senden pending={neuPending}>Konto anlegen und beitreten</Senden>
        </form>
      ) : (
        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label htmlFor="l-mail">E-Mail</Label>
            <Input id="l-mail" value={email} readOnly className={FELD} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-pw">Passwort</Label>
            <Input id="l-pw" name="password" type="password" required autoComplete="current-password" className={FELD} />
          </div>
          <Fehler state={loginState} />
          <Senden pending={loginPending}>Anmelden und beitreten</Senden>
        </form>
      )}
    </div>
  )
}
