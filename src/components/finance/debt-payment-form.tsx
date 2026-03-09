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
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createDebt,
  updateDebt,
  deleteDebt,
  recordPayment,
  type DebtActionState,
} from '@/app/(dashboard)/finance/debts/actions'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Database } from '@/types/database'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

type Debt = Database['public']['Tables']['debts']['Row']

const DEBT_TYPES = [
  { value: 'borrowed', label: 'Geliehen (ich schulde)' },
  { value: 'lent', label: 'Verliehen (mir wird geschuldet)' },
]

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP']

// fmt used in DebtPaymentDialog — locale injected there via useSettings

// ─────────────────────────────────────────────
// Add Debt Dialog
// ─────────────────────────────────────────────
export function AddDebtDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('borrowed')
  const [currency, setCurrency] = useState('EUR')

  const [state, formAction, isPending] = useActionState<DebtActionState, FormData>(
    createDebt,
    null
  )

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setType('borrowed')
      setCurrency('EUR')
    }
  }

  const creditorLabel = type === 'borrowed' ? 'Gläubiger' : 'Schuldner'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Schuld anlegen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Schuld anlegen</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="currency" value={currency} />

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="debt-name">Bezeichnung *</Label>
            <Input id="debt-name" name="name" placeholder="z.B. Auto-Kredit, Freund Max" required />
          </div>

          {/* Typ + Währung */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Typ *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEBT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Währung *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Betrag + Ausstehend */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-amount">Gesamtbetrag *</Label>
              <Input
                id="debt-amount"
                name="original_amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-outstanding">Ausstehend</Label>
              <Input
                id="debt-outstanding"
                name="outstanding"
                type="number"
                step="0.01"
                min="0"
                placeholder="= Gesamtbetrag"
              />
            </div>
          </div>

          {/* Gläubiger / Schuldner + Fälligkeitsdatum */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-creditor">{creditorLabel}</Label>
              <Input id="debt-creditor" name="creditor" placeholder="Name oder Institution" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-due">Fällig am</Label>
              <Input id="debt-due" name="due_date" type="date" />
            </div>
          </div>

          {/* Zinssatz + Monatsrate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-interest">Zinssatz (%)</Label>
              <Input
                id="debt-interest"
                name="interest_rate"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-rate">Monatsrate</Label>
              <Input
                id="debt-rate"
                name="monthly_payment"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="debt-notes">Notizen</Label>
            <textarea
              id="debt-notes"
              name="notes"
              rows={2}
              placeholder="Optionale Anmerkungen…"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Edit Debt Dialog
// ─────────────────────────────────────────────
export function EditDebtDialog({ debt }: { debt: Debt }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(debt.type)
  const [currency, setCurrency] = useState(debt.currency)

  const [state, formAction, isPending] = useActionState<DebtActionState, FormData>(updateDebt, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const creditorLabel = type === 'borrowed' ? 'Gläubiger' : 'Schuldner'

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (v) { setType(debt.type); setCurrency(debt.currency) } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schuld bearbeiten</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="id" value={debt.id} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="currency" value={currency} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-debt-name">Bezeichnung *</Label>
            <Input id="edit-debt-name" name="name" defaultValue={debt.name} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Typ *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEBT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Währung *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-amount">Gesamtbetrag *</Label>
              <Input id="edit-debt-amount" name="original_amount" type="number" step="0.01" min="0.01" defaultValue={debt.original_amount} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-outstanding">Ausstehend</Label>
              <Input id="edit-debt-outstanding" name="outstanding" type="number" step="0.01" min="0" defaultValue={debt.outstanding} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-creditor">{creditorLabel}</Label>
              <Input id="edit-debt-creditor" name="creditor" defaultValue={debt.creditor ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-due">Fällig am</Label>
              <Input id="edit-debt-due" name="due_date" type="date" defaultValue={debt.due_date ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-interest">Zinssatz (%)</Label>
              <Input id="edit-debt-interest" name="interest_rate" type="number" step="0.01" min="0" defaultValue={debt.interest_rate ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-debt-rate">Monatsrate</Label>
              <Input id="edit-debt-rate" name="monthly_payment" type="number" step="0.01" min="0" defaultValue={debt.monthly_payment ?? ''} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-debt-notes">Notizen</Label>
            <textarea id="edit-debt-notes" name="notes" rows={2} defaultValue={debt.notes ?? ''}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          {state && 'error' in state && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? 'Wird gespeichert…' : 'Speichern'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Delete Debt Button
// ─────────────────────────────────────────────
export function DeleteDebtButton({ debt }: { debt: Debt }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDebt(debt.id)
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
          <AlertDialogTitle>Schuld löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{debt.name}</strong> und alle Zahlungen werden unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive px-1">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive text-white hover:bg-destructive/90">
            {isPending ? 'Wird gelöscht…' : 'Löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─────────────────────────────────────────────
// Payment Dialog
// ─────────────────────────────────────────────
export function DebtPaymentDialog({ debt }: { debt: Debt }) {
  const { locale } = useSettings()
  const fmt = (amount: number, currency: string) => fmtCurrency(amount, currency, locale)
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [state, formAction, isPending] = useActionState<DebtActionState, FormData>(
    recordPayment,
    null
  )

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const today = new Date().toISOString().split('T')[0]
  const maxAmount = debt.outstanding

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CreditCard className="size-3.5" />
          Zahlung erfassen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm mb-2">
          <span className="text-muted-foreground">Ausstehend: </span>
          <span className="font-semibold">{fmt(debt.outstanding, debt.currency)}</span>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="debt_id" value={debt.id} />

          {/* Datum + Betrag */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Datum *</Label>
              <Input id="pay-date" name="payment_date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Betrag *</Label>
              <Input
                id="pay-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={maxAmount}
                placeholder="0,00"
                required
              />
            </div>
          </div>

          {/* Tilgung + Zinsen (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-principal">Tilgung</Label>
              <Input id="pay-principal" name="principal" type="number" step="0.01" min="0" placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-interest">Zinsen</Label>
              <Input id="pay-interest" name="interest" type="number" step="0.01" min="0" placeholder="—" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notizen</Label>
            <Input id="pay-notes" name="notes" placeholder="Optionale Anmerkung" />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Zahlung buchen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
