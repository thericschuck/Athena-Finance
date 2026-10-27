'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createContract, updateContract, deleteContract, type ContractActionState,
} from '@/app/(dashboard)/finance/(planung)/contracts/actions'
import { Database } from '@/types/database'
import type { ContractRow } from '@/lib/data/finance-planning'
import { TeilenSchalter } from '@/components/haushalt/TeilenSchalter'
import { CONTRACT_TYPES, FREQUENCIES, TRANSFER_TYPES } from '@/lib/finance/contract-constants'
import { betragAusNutzereingabe, betragFuerFeld, heuteBerlin, kanonisch, MAX_BETRAG } from '@/lib/transaktionen/formular'

type Contract = ContractRow
type Account  = Pick<Database['public']['Tables']['accounts']['Row'],  'id' | 'name'>
type Category = Pick<Database['public']['Tables']['categories']['Row'], 'id' | 'name'>

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP']

/** Felder: am Handy 16 px (kein Zoom beim Fokussieren) und 40 px hoch, ab sm kompakt. */
const FELD = 'h-10 text-base sm:h-9 sm:text-sm'
const WAHL = 'w-full data-[size=default]:h-10 sm:data-[size=default]:h-9'

// ─── Shared form fields ───────────────────────────────────────────────────────
function ContractFields({
  contract, type, setType, frequency, setFrequency, currency, setCurrency,
  accountId, setAccountId, toAccountId, setToAccountId, categoryId, setCategoryId,
  accounts, categories,
}: {
  contract?: Contract
  type: string;          setType: (v: string) => void
  frequency: string;     setFrequency: (v: string) => void
  currency: string;      setCurrency: (v: string) => void
  accountId: string;     setAccountId: (v: string) => void
  toAccountId: string;   setToAccountId: (v: string) => void
  categoryId: string;    setCategoryId: (v: string) => void
  accounts: Account[]
  categories: Category[]
}) {
  const isTransfer = TRANSFER_TYPES.has(type)

  return (
    <>
      {contract && <input type="hidden" name="id" value={contract.id} />}
      <input type="hidden" name="type"           value={type} />
      <input type="hidden" name="frequency"      value={frequency} />
      <input type="hidden" name="currency"       value={currency} />
      <input type="hidden" name="account_id"     value={accountId} />
      <input type="hidden" name="to_account_id"  value={isTransfer ? toAccountId : ''} />
      <input type="hidden" name="category_id"    value={isTransfer ? '__none__' : categoryId} />

      {/* Name + Anbieter */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="c-name">Name *</Label>
          <Input id="c-name" name="name" defaultValue={contract?.name} className={FELD}
            placeholder={isTransfer ? 'z.B. Monatliche Depoteinzahlung' : 'z.B. Netflix'} required />
        </div>
        {!isTransfer && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="c-provider">Anbieter</Label>
            <Input id="c-provider" name="provider" defaultValue={contract?.provider ?? ''} className={FELD} placeholder="z.B. Netflix Inc." />
          </div>
        )}
      </div>

      {/* Typ + Intervall */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label>Typ *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className={WAHL}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTRACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label>Intervall *</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className={WAHL}><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Betrag + Währung + Abrechnungstag */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 min-w-0 space-y-1.5 sm:col-span-1">
          <Label htmlFor="c-amount">Betrag *</Label>
          <Input id="c-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" className={FELD}
            defaultValue={contract ? betragFuerFeld(contract.amount) : ''} placeholder="0,00" required />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label>Währung *</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className={WAHL}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="c-bday">Abrechnungstag</Label>
          <Input id="c-bday" name="billing_day" type="number" inputMode="numeric" min="1" max="31" className={FELD}
            defaultValue={contract?.billing_day ?? ''} placeholder="1–31" />
        </div>
      </div>

      {/* Start + Ende */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="c-start">Startdatum *</Label>
          <Input id="c-start" name="start_date" type="date" className={FELD}
            defaultValue={contract?.start_date ?? heuteBerlin()} required />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="c-end">Enddatum</Label>
          <Input id="c-end" name="end_date" type="date" className={FELD}
            defaultValue={contract?.end_date ?? ''} />
        </div>
      </div>

      {/* Kündigungsfrist + Auto-Verlängerung */}
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="c-notice">Kündigungsfrist (Tage)</Label>
          <Input id="c-notice" name="notice_days" type="number" inputMode="numeric" min="0" className={FELD}
            defaultValue={contract?.notice_days ?? 0} placeholder="0" />
        </div>
        <label htmlFor="c-autorenew" className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            id="c-autorenew"
            name="auto_renews"
            type="checkbox"
            defaultChecked={contract?.auto_renews ?? true}
            className="size-5 rounded border-input accent-primary sm:size-4"
          />
          Automatische Verlängerung
        </label>
      </div>

      {/* Konto + Zielkonto (bei Transfer) oder Kategorie */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label>{isTransfer ? 'Quellkonto' : 'Konto'}</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className={WAHL}><SelectValue placeholder="Kein Konto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Kein Konto</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isTransfer ? (
          <div className="min-w-0 space-y-1.5">
            <Label>Zielkonto *</Label>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger className={WAHL}><SelectValue placeholder="Zielkonto wählen…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kein Zielkonto</SelectItem>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="min-w-0 space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className={WAHL}><SelectValue placeholder="Keine" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Keine</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="c-notes">Notizen</Label>
        <textarea
          id="c-notes"
          name="notes"
          rows={2}
          defaultValue={contract?.notes ?? ''}
          placeholder="Optionale Anmerkungen…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
        />
      </div>

      <TeilenSchalter defaultChecked={contract?.shared ?? false} unbekannt={!!contract && contract.shared === undefined} />
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function ContractDialog({
  mode, contract, accounts, categories, trigger,
}: {
  mode: 'create' | 'edit'
  contract?: Contract
  accounts: Account[]
  categories: Category[]
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lokalerFehler, setLokalerFehler] = useState<string | null>(null)

  const initType       = contract?.type         ?? 'subscription'
  const initFreq       = contract?.frequency    ?? 'monthly'
  const initCurrency   = contract?.currency     ?? 'EUR'
  const initAccount    = contract?.account_id   ?? '__none__'
  const initToAccount  = contract?.to_account_id ?? '__none__'
  const initCategory   = contract?.category_id  ?? '__none__'

  const [type,         setType]         = useState(initType)
  const [frequency,    setFrequency]    = useState(initFreq)
  const [currency,     setCurrency]     = useState(initCurrency)
  const [accountId,    setAccountId]    = useState(initAccount)
  const [toAccountId,  setToAccountId]  = useState(initToAccount)
  const [categoryId,   setCategoryId]   = useState(initCategory)

  const action = mode === 'create' ? createContract : updateContract
  const [state, formAction, isPending] = useActionState<ContractActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setLokalerFehler(null)
      setType(initType); setFrequency(initFreq); setCurrency(initCurrency)
      setAccountId(initAccount); setToAccountId(initToAccount); setCategoryId(initCategory)
    }
  }

  function handleAction(fd: FormData) {
    // Eine Betragsregel wie bei den Buchungen: deutsche Schreibweise lesen, kanonisch zum Server.
    const betrag = betragAusNutzereingabe(String(fd.get('amount') ?? ''))
    if (betrag === null || betrag <= 0 || betrag > MAX_BETRAG) {
      setLokalerFehler('Betrag ungültig: bitte eine Zahl größer als 0 eingeben, z. B. 12,99.')
      return
    }
    if (TRANSFER_TYPES.has(String(fd.get('type'))) && (fd.get('to_account_id') === '__none__' || !fd.get('to_account_id'))) {
      setLokalerFehler('Bei Umbuchungen und Sparraten ist ein Zielkonto nötig.')
      return
    }
    const start = String(fd.get('start_date') ?? '')
    const ende = String(fd.get('end_date') ?? '')
    if (ende && start && ende < start) {
      setLokalerFehler('Das Enddatum liegt vor dem Startdatum.')
      return
    }
    setLokalerFehler(null)
    fd.set('amount', kanonisch(betrag))
    if (fd.get('account_id')    === '__none__') fd.set('account_id',    '')
    if (fd.get('to_account_id') === '__none__') fd.set('to_account_id', '')
    if (fd.get('category_id')   === '__none__') fd.set('category_id',   '')
    formAction(fd)
  }

  const fehler = lokalerFehler ?? (state && 'error' in state ? state.error : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Neuer Vertrag' : 'Vertrag bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={handleAction} className="min-w-0 space-y-4 pt-2">
          <ContractFields
            contract={contract} accounts={accounts} categories={categories}
            type={type} setType={setType}
            frequency={frequency} setFrequency={setFrequency}
            currency={currency} setCurrency={setCurrency}
            accountId={accountId} setAccountId={setAccountId}
            toAccountId={toAccountId} setToAccountId={setToAccountId}
            categoryId={categoryId} setCategoryId={setCategoryId}
          />
          {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" className="h-10 sm:h-8" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : mode === 'create' ? 'Anlegen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Public exports ───────────────────────────────────────────────────────────
export function AddContractDialog({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  return (
    <ContractDialog
      mode="create" accounts={accounts} categories={categories}
      trigger={<Button size="sm" className="h-10 shrink-0 sm:h-8"><Plus className="size-4" />Vertrag anlegen</Button>}
    />
  )
}

export function EditContractDialog({ contract, accounts, categories }: { contract: Contract; accounts: Account[]; categories: Category[] }) {
  return (
    <ContractDialog
      mode="edit" contract={contract} accounts={accounts} categories={categories}
      trigger={
        <Button variant="ghost" size="icon-sm" className="size-10 md:size-8" aria-label={`${contract.name} bearbeiten`}>
          <Pencil className="size-3.5" />
        </Button>
      }
    />
  )
}

export function DeleteContractButton({ contract, redirectTo }: { contract: Contract; redirectTo?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteContract(contract.id)
      if (result.error) { setError(result.error); return }
      setOpen(false)
      // Auf der Detailseite gibt es den Vertrag danach nicht mehr — dorthin zu refreshen endete auf einer 404.
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={next => { setOpen(next); setError(null) }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-10 text-muted-foreground hover:text-destructive md:size-8" aria-label={`${contract.name} löschen`}>
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vertrag löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{contract.name}</strong> wird unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="px-1 text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 sm:h-9">Abbrechen</AlertDialogCancel>
          {/* Eigener Button statt AlertDialogAction: die Action schließt den Dialog sofort, auch wenn das Löschen scheitert. */}
          <Button variant="destructive" className="h-10 sm:h-9" onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
