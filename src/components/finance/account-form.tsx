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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
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
import { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

const ACCOUNT_TYPES = [
  { value: 'checking',        label: 'Girokonto' },
  { value: 'savings',         label: 'Sparkonto' },
  { value: 'building_savings',label: 'Bausparvertrag' },
  { value: 'investment',      label: 'Depot / Investment' },
  { value: 'crypto',          label: 'Krypto' },
  { value: 'cash',            label: 'Bargeld' },
  { value: 'credit',          label: 'Kreditkarte' },
] as const

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH'] as const

// ─── Shared form fields ───────────────────────────────────────────────────────
function AccountFields({
  account, type, setType, currency, setCurrency,
}: {
  account?: Account
  type: string;     setType: (v: string) => void
  currency: string; setCurrency: (v: string) => void
}) {
  return (
    <>
      {account && <input type="hidden" name="id" value={account.id} />}
      <input type="hidden" name="type"     value={type} />
      <input type="hidden" name="currency" value={currency} />
      {account && (
        <input type="hidden" name="is_active" value={String(account.is_active)} />
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Name *</Label>
        <Input
          id="acc-name"
          name="name"
          defaultValue={account?.name}
          placeholder="z.B. DKB Girokonto"
          required
        />
      </div>

      {/* Typ */}
      <div className="space-y-1.5">
        <Label>Typ *</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="Typ wählen…" /></SelectTrigger>
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
        />
      </div>

      {/* Währung */}
      <div className="space-y-1.5">
        <Label>Währung *</Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger><SelectValue placeholder="Währung wählen…" /></SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color + IBAN */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="acc-color">Farbe</Label>
          <div className="flex items-center gap-2">
            <input
              id="acc-color"
              name="color"
              type="color"
              defaultValue={account?.color ?? '#6366f1'}
              className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <span className="text-xs text-muted-foreground">Konto-Farbe</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-iban">IBAN</Label>
          <Input
            id="acc-iban"
            name="iban"
            defaultValue={account?.iban ?? ''}
            placeholder="DE00 0000 …"
            className="text-xs"
          />
        </div>
      </div>
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
  const initCurrency = account?.currency ?? ''

  const [type,     setType]     = useState(initType)
  const [currency, setCurrency] = useState(initCurrency)

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
    if (next) { setType(initType); setCurrency(initCurrency) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neues Konto anlegen' : 'Konto bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <AccountFields
            account={account}
            type={type} setType={setType}
            currency={currency} setCurrency={setCurrency}
          />
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
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
        <Button size="sm">
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
      trigger={<Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>}
    />
  )
}

export function DeleteAccountButton({ account }: { account: Account }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount(account.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <AlertDialog onOpenChange={() => setError(null)}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konto löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{account.name}</strong> und alle zugehörigen Daten werden unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive px-1">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
