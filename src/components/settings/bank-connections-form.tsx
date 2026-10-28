'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  addBankConnection, editBankConnection, getBankConnectionsOverview, removeBankConnection,
  type BankConnectionState, type BankConnectionsOverview,
} from '@/app/(dashboard)/settings/bank-connection-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AlertTriangle, Landmark, Loader2, Lock, Pencil, Plus, Trash2 } from 'lucide-react'

function formatDateTime(iso: string | null): string {
  if (!iso) return 'noch nie'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unbekannt'
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Abschnitt „Bankverbindungen" (FinTS) in den Einstellungen. Geheimnisse werden nie angezeigt. */
export function BankConnectionsForm() {
  const [overview, setOverview] = useState<BankConnectionsOverview | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(() => {
    getBankConnectionsOverview()
      .then(setOverview)
      .catch(() => setOverview({ connections: [], envFallback: null }))
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Landmark className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none">Bankverbindungen</p>
            <p className="text-xs text-muted-foreground mt-0.5">FinTS-Zugang für den automatischen Kontoabruf</p>
          </div>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Hinzufügen
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex gap-1.5">
        <Lock className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Benutzerkennung und PIN werden verschlüsselt gespeichert und nie wieder angezeigt. Die PIN lässt sich
          jederzeit überschreiben, aber nicht auslesen. Die Freigabe von Abrufen (SecureGo plus o. Ä.) bleibt in
          deiner Banking-App.
        </span>
      </p>

      {overview === null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          {overview.envFallback && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Der Abruf läuft derzeit noch über die serverseitig hinterlegte Verbindung
              („{overview.envFallback.label}“, BLZ {overview.envFallback.blz}, Kennung {overview.envFallback.usernameHint}).
              Sobald du hier eine eigene Verbindung einträgst, wird sie stattdessen verwendet.
            </div>
          )}

          {overview.connections.length === 0 && !overview.envFallback && !adding && (
            <p className="text-sm text-muted-foreground">Noch keine Bankverbindung eingetragen.</p>
          )}

          <ul className="space-y-3">
            {overview.connections.map(c => (
              <ConnectionItem key={c.id} connection={c} onChanged={reload} />
            ))}
          </ul>

          {adding && (
            <AddForm
              onDone={() => { setAdding(false); reload() }}
              onCancel={() => setAdding(false)}
              hasFallback={!!overview.envFallback}
            />
          )}
        </>
      )}
    </div>
  )
}

function ConnectionItem({
  connection: c,
  onChanged,
}: {
  connection: BankConnectionsOverview['connections'][number]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  function remove() {
    const fd = new FormData()
    fd.set('id', c.id)
    startTransition(async () => {
      const res = await removeBankConnection(null, fd)
      if (res && 'error' in res) toast.error(res.error)
      else { toast.success('Bankverbindung gelöscht'); onChanged() }
    })
  }

  return (
    <li className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{c.label}</p>
          <p className="text-xs text-muted-foreground">
            BLZ {c.blz} · Kennung {c.usernameHint ?? '***'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Bearbeiten" onClick={() => setEditing(e => !e)}>
            <Pencil className="size-3.5" />
          </Button>
          <ConfirmDialog
            title="Bankverbindung löschen?"
            description="Die gespeicherten Zugangsdaten werden unwiderruflich gelöscht. Bereits importierte Buchungen bleiben erhalten."
            confirmLabel="Löschen"
            onConfirm={remove}
          >
            <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Löschen" disabled={pending}>
              <Trash2 className="size-3.5" />
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Letzter Abruf: {formatDateTime(c.lastSyncAt)}</p>
      {c.lastError && (
        <p className="text-xs text-destructive flex gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{c.lastError}</span>
        </p>
      )}

      {editing && <EditForm connection={c} onDone={() => { setEditing(false); onChanged() }} />}
    </li>
  )
}

function useActionToast(
  state: BankConnectionState,
  message: string,
  onSuccess: () => void,
) {
  useEffect(() => {
    if (!state) return
    if ('success' in state) { toast.success(message); onSuccess() }
    else toast.error(state.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
}

function AddForm({ onDone, onCancel, hasFallback }: { onDone: () => void; onCancel: () => void; hasFallback: boolean }) {
  const [state, action, pending] = useActionState<BankConnectionState, FormData>(addBankConnection, null)
  useActionToast(state, 'Bankverbindung gespeichert', onDone)

  return (
    <form action={action} autoComplete="off" className="space-y-3 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-medium">Neue Bankverbindung</p>
      {hasFallback && (
        <p className="text-xs text-muted-foreground">
          Achtung: Mit dem Speichern wird diese Verbindung statt der serverseitig hinterlegten verwendet.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bc-label" name="label" label="Bezeichnung" placeholder="z. B. Raiffeisenbank" />
        <Field id="bc-blz" name="blz" label="BLZ" placeholder="8 Ziffern" inputMode="numeric" />
      </div>
      <Field id="bc-url" name="fints_url" label="Bank-URL (FinTS-Endpunkt)" placeholder="https://…" type="url" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bc-username" name="username" label="Benutzerkennung (VR-NetKey o. Ä.)" />
        <Field id="bc-pin" name="pin" label="PIN" type="password" autoComplete="new-password" />
      </div>
      <Field id="bc-tan" name="tan_medium" label="TAN-Medium (optional)" placeholder="z. B. SecureGo plus" required={false} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Wird gespeichert…' : 'Speichern'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>
      </div>
    </form>
  )
}

function EditForm({ connection: c, onDone }: { connection: BankConnectionsOverview['connections'][number]; onDone: () => void }) {
  const [state, action, pending] = useActionState<BankConnectionState, FormData>(editBankConnection, null)
  useActionToast(state, 'Bankverbindung aktualisiert', onDone)

  return (
    <form action={action} autoComplete="off" className="space-y-3 border-t border-border pt-3">
      <input type="hidden" name="id" value={c.id} />
      <Field id={`bc-${c.id}-label`} name="label" label="Bezeichnung" defaultValue={c.label} />
      <Field id={`bc-${c.id}-url`} name="fints_url" label="Bank-URL" type="url" defaultValue={c.fintsUrl} />
      <Field id={`bc-${c.id}-tan`} name="tan_medium" label="TAN-Medium (optional)" defaultValue={c.tanMedium ?? ''} required={false} />
      <Field
        id={`bc-${c.id}-pin`} name="pin" label="Neue PIN (leer = unverändert)" type="password"
        autoComplete="new-password" required={false}
      />
      <p className="text-xs text-muted-foreground">
        Die Benutzerkennung lässt sich nicht ändern. Dafür Verbindung löschen und neu anlegen.
      </p>
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Wird gespeichert…' : 'Änderungen speichern'}</Button>
    </form>
  )
}

function Field({
  id, name, label, required = true, ...rest
}: { id: string; name: string; label: string; required?: boolean } & Omit<React.ComponentProps<'input'>, 'id' | 'name'>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <Input id={id} name={name} required={required} {...rest} />
    </div>
  )
}
