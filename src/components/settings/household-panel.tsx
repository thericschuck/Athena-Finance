'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Mail, Trash2, UserMinus, Users } from 'lucide-react'
import {
  entferneMitglied, erstelleEinladung, getHaushaltUebersicht, sendeEinladungPerMail, widerrufeEinladung,
  type HaushaltUebersicht,
} from '@/app/(dashboard)/settings/haushalt-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

function datum(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { dateStyle: 'medium' })
}

/** Abschnitt "Haushalt": Mitglieder, Einladungen (Owner), Mitglied entfernen (Owner). Mitglieder sehen die Liste nur lesend. */
export function HouseholdPanel() {
  const [u, setU] = useState<HaushaltUebersicht | null>(null)
  const reload = useCallback(() => {
    getHaushaltUebersicht().then(setU).catch(() => setU({ haushaltName: null, istOwner: false, mitglieder: [], einladungen: [], mailMoeglich: false }))
  }, [])
  useEffect(() => { reload() }, [reload])

  if (u === null) return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  if (!u.haushaltName && u.mitglieder.length === 0) {
    return <p className="text-sm text-muted-foreground">Dein Konto gehört zu keinem Haushalt.</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Users className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate">Haushalt „{u.haushaltName}“</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {u.istOwner ? 'Du bist Owner dieses Haushalts.' : 'Du bist Mitglied. Nur der Owner verwaltet Mitglieder und Einladungen.'}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {u.mitglieder.map(m => (
            <MitgliedZeile key={m.id} m={m} darfEntfernen={u.istOwner && !m.ich && m.role === 'member'} onChanged={reload} />
          ))}
        </ul>
      </div>

      {u.istOwner && (
        <>
          <EinladungNeu mailMoeglich={u.mailMoeglich} onChanged={reload} />
          {u.einladungen.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-medium">Offene Einladungen</p>
              <ul className="divide-y divide-border">
                {u.einladungen.map(i => <EinladungZeile key={i.id} i={i} onChanged={reload} />)}
              </ul>
              <p className="text-xs text-muted-foreground">Den Link einer bestehenden Einladung kann Athena nicht mehr anzeigen (er wird nie gespeichert). Erstelle bei Bedarf eine neue Einladung; sie ersetzt die alte.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MitgliedZeile({ m, darfEntfernen, onChanged }: { m: HaushaltUebersicht['mitglieder'][number]; darfEntfernen: boolean; onChanged: () => void }) {
  const [pending, start] = useTransition()
  function entfernen() {
    start(async () => {
      const res = await entferneMitglied(m.id)
      if (res.error) toast.error(res.error)
      else { toast.success('Mitglied entfernt'); onChanged() }
    })
  }
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {m.name ?? m.email ?? 'Mitglied'}{m.ich && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(du)</span>}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {m.role === 'owner' ? 'Owner' : 'Mitglied'}{m.email && m.name ? ` · ${m.email}` : ''} · seit {datum(m.joinedAt)}
        </p>
      </div>
      {darfEntfernen && (
        <ConfirmDialog
          title="Mitglied entfernen?"
          description={
            'Die Daten des Mitglieds (Konten, Buchungen, Verträge, Steuerdaten) bleiben bei ihm und werden nicht gelöscht. ' +
            'Geteilte Einträge des Mitglieds werden wieder privat und verschwinden aus der Haushaltsansicht. ' +
            'Das Mitglied erhält eine private Kopie des aktuellen Kategorienbaums für seine Buchungen; von ihm angelegte Kategorien gehen an den Haushalt. ' +
            'Das Mitglied sieht danach nichts mehr vom Haushalt. Du kannst es später erneut einladen.'
          }
          confirmLabel="Entfernen"
          onConfirm={entfernen}
        >
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 text-destructive" disabled={pending}>
            <UserMinus className="size-3.5" />
            Entfernen
          </Button>
        </ConfirmDialog>
      )}
    </li>
  )
}

function EinladungZeile({ i, onChanged }: { i: HaushaltUebersicht['einladungen'][number]; onChanged: () => void }) {
  const [pending, start] = useTransition()
  function widerrufen() {
    start(async () => {
      const res = await widerrufeEinladung(i.id)
      if (res.error) toast.error(res.error)
      else { toast.success('Einladung widerrufen'); onChanged() }
    })
  }
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm truncate">{i.email}</p>
        <p className="text-xs text-muted-foreground">{i.abgelaufen ? 'abgelaufen' : `gültig bis ${datum(i.expiresAt)}`}</p>
      </div>
      <Button size="sm" variant="ghost" className="gap-1.5 shrink-0 text-destructive" onClick={widerrufen} disabled={pending} aria-label="Einladung widerrufen">
        <Trash2 className="size-3.5" />
        Widerrufen
      </Button>
    </li>
  )
}

function EinladungNeu({ mailMoeglich, onChanged }: { mailMoeglich: boolean; onChanged: () => void }) {
  const [state, action, pending] = useActionState(erstelleEinladung, null)
  const [mailState, mailAction, mailPending] = useActionState(sendeEinladungPerMail, null)
  const [kopiert, setKopiert] = useState(false)
  const [lastSeen, setLastSeen] = useState<unknown>(null)

  // Liste neu laden, sobald eine Einladung angelegt wurde (einmal je neuem Ergebnis).
  useEffect(() => {
    if (state && state !== lastSeen && 'success' in state) { setLastSeen(state); setKopiert(false); onChanged() }
  }, [state, lastSeen, onChanged])

  async function kopieren(link: string) {
    try { await navigator.clipboard.writeText(link); setKopiert(true) } catch { toast.error('Kopieren nicht möglich. Bitte den Link markieren und kopieren.') }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-sm font-medium">Person einladen</p>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:flex-1">
          <Label htmlFor="inv-mail">E-Mail-Adresse</Label>
          <Input id="inv-mail" name="email" type="email" required maxLength={320} autoComplete="off" placeholder="name@beispiel.de" className="h-10 text-base sm:h-9 sm:text-sm" />
        </div>
        <Button type="submit" disabled={pending} className="h-10 sm:h-9">
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Einladungslink erstellen
        </Button>
      </form>
      {state && 'error' in state && <p role="alert" className="text-sm text-destructive">{state.error}</p>}

      {state && 'success' in state && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            Einladung für <span className="font-medium text-foreground">{state.email}</span>, gültig bis {datum(state.ablauf)}. Der Link wird nur jetzt
            angezeigt und nirgends gespeichert. Schicke ihn selbst oder versende ihn per Mail.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} onFocus={e => e.currentTarget.select()} className="h-10 font-mono text-xs sm:h-9" aria-label="Einladungslink" />
            <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5 sm:h-9" onClick={() => kopieren(state.link)}>
              {kopiert ? <Check className="size-4" /> : <Copy className="size-4" />}
              {kopiert ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          {mailMoeglich ? (
            <form action={mailAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="token" value={state.token} />
              <Button type="submit" variant="outline" size="sm" className="gap-1.5" disabled={mailPending}>
                {mailPending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                Per E-Mail an {state.email} senden
              </Button>
              {mailState && 'success' in mailState && <span className="text-xs text-muted-foreground">Mail gesendet.</span>}
              {mailState && 'error' in mailState && <span role="alert" className="text-xs text-destructive">{mailState.error}</span>}
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Mailversand ist nicht eingerichtet (RESEND_API_KEY und REPORT_FROM_EMAIL). Bitte den Link selbst senden.</p>
          )}
        </div>
      )}
    </div>
  )
}
