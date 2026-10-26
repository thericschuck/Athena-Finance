'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createAccount,
  updateAccount,
  deleteAccount,
  type AccountActionState,
} from '@/app/(dashboard)/finance/accounts/actions'
import type { AccountRow } from '@/lib/data/finance-accounts'

type Account = AccountRow

const ACCOUNT_TYPES = [
  { value: 'checking',        label: 'Girokonto' },
  { value: 'savings',         label: 'Sparkonto' },
  { value: 'building_savings',label: 'Bausparvertrag' },
  { value: 'investment',      label: 'Depot / Investment' },
  { value: 'crypto',          label: 'Krypto' },
  { value: 'cash',            label: 'Bargeld' },
  { value: 'credit',          label: 'Kreditkarte' },
  { value: 'other',           label: 'Sonstiges' },
] as const

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH'] as const

const SELECT_TRIGGER = 'h-10 w-full text-base sm:h-9 sm:text-sm'

// ─── Shared form fields ───────────────────────────────────────────────────────
function AccountFields({
  account, type, setType, currency, setCurrency, aktiv, setAktiv, hatBuchungenHinweis,
}: {
  account?: Account
  type: string;     setType: (v: string) => void
  currency: string; setCurrency: (v: string) => void
  aktiv: boolean;   setAktiv: (v: boolean) => void
  hatBuchungenHinweis: boolean
}) {
  return (
    <>
      {account && <input type="hidden" name="id" value={account.id} />}
      <input type="hidden" name="type"     value={type} />
      <input type="hidden" name="currency" value={currency} />
      {account && <input type="hidden" name="is_active" value={String(aktiv)} />}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Name *</Label>
        <Input
          id="acc-name"
          name="name"
          defaultValue={account?.name}
          placeholder="z.B. DKB Girokonto"
          maxLength={100}
          required
          className="h-10 text-base sm:h-9 sm:text-sm"
        />
      </div>

      {/* Typ */}
      <div className="space-y-1.5">
        <Label>Typ *</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="Typ wählen…" /></SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Institution */}
      <div className="space-y-1.5">
        <Label htmlFor="acc-institution">Institution</Label>
        <Input
          id="acc-institution"
          name="institution"
          defaultValue={account?.institution ?? ''}
          placeholder="z.B. DKB, ING, Coinbase"
          maxLength={200}
          className="h-10 text-base sm:h-9 sm:text-sm"
        />
      </div>

      {/* Währung */}
      <div className="space-y-1.5">
        <Label>Währung *</Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className={SELECT_TRIGGER}><SelectValue placeholder="Währung wählen…" /></SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hatBuchungenHinweis && (
          <p className="text-xs text-muted-foreground">
            Bestehende Buchungen werden nicht umgerechnet: die Währung nur ändern, wenn das Konto neu ist.
          </p>
        )}
      </div>

      {/* Color + IBAN */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="acc-color">Farbe</Label>
          <div className="flex items-center gap-2">
            <input
              id="acc-color"
              name="color"
              type="color"
              defaultValue={account?.color ?? '#64748b'}
              className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1 sm:h-9 sm:w-12"
            />
            <span className="text-xs text-muted-foreground">Konto-Farbe</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-iban">IBAN / Kontonummer</Label>
          <Input
            id="acc-iban"
            name="iban"
            defaultValue={account?.iban ?? ''}
            placeholder="DE00 0000 … oder Kontonummer"
            autoComplete="off"
            maxLength={60}
            className="h-10 text-base sm:h-9 sm:text-sm"
          />
        </div>
      </div>

      {/* Aktiv (nur beim Bearbeiten): inaktive Konten zählen nicht zu den Summen */}
      {account && (
        <label className="flex min-h-10 cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={aktiv}
            onChange={(e) => setAktiv(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            Konto aktiv
            <span className="block text-xs text-muted-foreground">
              Inaktive Konten sind ausgeblendet und zählen nicht zu den Summen.
            </span>
          </span>
        </label>
      )}
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function AccountDialog({
  mode, account, trigger,
}: {
  mode: 'create' | 'edit'
  account?: Account
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const initType     = account?.type     ?? ''
  const initCurrency = account?.currency ?? 'EUR'
  const initAktiv    = account?.is_active ?? true

  const [type,     setType]     = useState(initType)
  const [currency, setCurrency] = useState(initCurrency)
  const [aktiv,    setAktiv]    = useState(initAktiv)
  const [meldung,  setMeldung]  = useState<string | null>(null)

  const action = mode === 'create' ? createAccount : updateAccount
  const [state, formAction, isPending] = useActionState<AccountActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) { setType(initType); setCurrency(initCurrency); setAktiv(initAktiv); setMeldung(null) }
  }

  // Die Auswahlfelder sind Radix-Selects ohne eigenes `required`: vor dem Senden selbst prüfen.
  function vorSenden(e: React.FormEvent<HTMLFormElement>) {
    if (!type) {
      e.preventDefault()
      setMeldung('Bitte einen Kontotyp wählen.')
    } else if (!currency) {
      e.preventDefault()
      setMeldung('Bitte eine Währung wählen.')
    } else {
      setMeldung(null)
    }
  }

  const fehler = meldung ?? (state && 'error' in state ? state.error : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Konto anlegen' : 'Konto bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} onSubmit={vorSenden} className="space-y-4 pt-2">
          <AccountFields
            account={account}
            type={type} setType={setType}
            currency={currency} setCurrency={setCurrency}
            aktiv={aktiv} setAktiv={setAktiv}
            hatBuchungenHinweis={mode === 'edit'}
          />
          {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" className="h-10 sm:h-8" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : mode === 'create' ? 'Konto anlegen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Public exports ───────────────────────────────────────────────────────────
export function AddAccountDialog() {
  return (
    <AccountDialog
      mode="create"
      trigger={
        <Button size="sm" className="h-10 sm:h-8">
          <Plus className="size-4" />
          Konto hinzufügen
        </Button>
      }
    />
  )
}

export function EditAccountDialog({ account }: { account: Account }) {
  return (
    <AccountDialog
      mode="edit"
      account={account}
      trigger={
        <Button variant="ghost" size="icon-sm" className="size-10 md:size-8" aria-label={`${account.name} bearbeiten`}>
          <Pencil className="size-3.5" />
        </Button>
      }
    />
  )
}

/**
 * Löschen mit Folgewarnung. Verifiziert (pg_constraint): `transactions` und `account_balances`
 * hängen per ON DELETE CASCADE am Konto, Verträge/Anlagen verlieren nur die Zuordnung (SET NULL),
 * `bank_transactions` hat keinen Fremdschlüssel auf `accounts` (Zuordnung nur per IBAN) und bleibt.
 */
export function DeleteAccountButton({ account }: { account: Account }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount(account.id)
      if (result.error) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-10 text-muted-foreground hover:text-destructive md:size-8"
        aria-label={`${account.name} löschen`}
        onClick={() => { setError(null); setOpen(true) }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => { if (!isPending) setOpen(o) }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Konto „{account.name}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Das lässt sich nicht rückgängig machen. Es werden mitgelöscht:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>alle manuell erfassten Buchungen dieses Kontos</li>
                  <li>der gespeicherte Saldenverlauf des Kontos</li>
                </ul>
                <p>
                  Verträge und Anlagen, die auf dieses Konto zeigen, bleiben bestehen, verlieren aber die
                  Kontozuordnung.
                </p>
                {account.bank_iban && (
                  <p>
                    <strong>Achtung, Bankkonto:</strong> Der nächste Bank-Sync legt das Konto wieder an (ohne deine
                    Einstellungen), und die synchronisierten Buchungen hängen dann wieder daran. Zum Ausblenden ist
                    „inaktiv“ der richtige Weg.
                  </p>
                )}
                <p>Umbuchungen anderer Konten auf dieses Konto verlieren ihr Ziel.</p>
                <p>Wenn du das Konto nur ausblenden willst, setze es beim Bearbeiten auf inaktiv.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="px-1 text-sm text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Abbrechen</AlertDialogCancel>
            {/* Kein AlertDialogAction: der schließt den Dialog sofort, ein Fehler bliebe unsichtbar. */}
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? 'Wird gelöscht…' : 'Endgültig löschen'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
