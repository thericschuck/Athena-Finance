'use client'

import { useActionState, useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CheckCircle2, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createDebt,
  updateDebt,
  deleteDebt,
  recordPayment,
  type DebtActionState,
} from '@/app/(dashboard)/finance/(planung)/debts/actions'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { DebtRow } from '@/lib/data/finance-planning'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { heuteBerlin } from '@/lib/transaktionen/formular'
import { BetragEingabe } from '@/components/schulden/BetragEingabe'
import { cn } from '@/lib/utils'

type Debt = DebtRow

const DEBT_TYPES = [
  { value: 'borrowed', label: 'Ich schulde' },
  { value: 'lent', label: 'Mir wird geschuldet' },
]

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP']

const DIALOG = 'max-h-[90dvh] overflow-y-auto sm:max-w-md'
const FELD = 'h-10 text-base sm:text-sm'
const FEHLER = 'rounded-md bg-danger/10 px-3 py-2 text-sm text-danger'

function Fehler({ state }: { state: DebtActionState }) {
  if (!state || !('error' in state)) return null
  return <p role="alert" className={FEHLER}>{state.error}</p>
}

// ─────────────────────────────────────────────
// Gemeinsames Formular: Schuld anlegen / bearbeiten
// ─────────────────────────────────────────────
interface SchuldFormularProps {
  debt?: Debt
  defaultValues?: { name?: string; creditor?: string; original_amount?: number; type?: string }
  onFertig: () => void
  onAbbruch: () => void
}

function SchuldFormular({ debt, defaultValues, onFertig, onAbbruch }: SchuldFormularProps) {
  const router = useRouter()
  const bearbeiten = !!debt
  const [type, setType] = useState(debt?.type ?? defaultValues?.type ?? 'borrowed')
  const [currency, setCurrency] = useState(debt?.currency ?? 'EUR')
  const [state, formAction, isPending] = useActionState<DebtActionState, FormData>(
    bearbeiten ? updateDebt : createDebt,
    null,
  )

  useEffect(() => {
    if (state && 'success' in state) {
      router.refresh()
      onFertig()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router])

  const creditorLabel = type === 'borrowed' ? 'Gläubiger' : 'Schuldner'
  const hatZinsDaten = !!debt && (debt.interest_rate != null || debt.monthly_payment != null || !!debt.due_date || !!debt.notes)

  return (
    <form action={formAction} className="min-w-0 space-y-4 pt-1">
      {debt && <input type="hidden" name="id" value={debt.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="currency" value={currency} />

      <div className="space-y-1.5">
        <Label htmlFor="debt-name">Bezeichnung *</Label>
        <Input
          id="debt-name"
          name="name"
          className={FELD}
          placeholder="z.B. Auto-Kredit, Freund Max"
          defaultValue={debt?.name ?? defaultValues?.name ?? ''}
          required
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium leading-none">Richtung *</span>
        <div role="radiogroup" aria-label="Richtung" className="grid grid-cols-2 gap-2">
          {DEBT_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={cn(
                'h-10 rounded-md border px-2 text-sm font-medium transition-colors',
                type === t.value
                  ? t.value === 'borrowed'
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-success/40 bg-success/10 text-success'
                  : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_5.5rem] gap-3">
        <BetragEingabe id="debt-amount" name="original_amount" label="Gesamtbetrag" startwert={debt?.original_amount ?? defaultValues?.original_amount} pflicht />
        <div className="space-y-1.5">
          <Label htmlFor="debt-currency">Währung</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="debt-currency" className={cn(FELD, 'w-full')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <BetragEingabe
        id="debt-outstanding"
        name="outstanding"
        label="Noch offen"
        startwert={debt?.outstanding}
        platzhalter={bearbeiten ? 'unverändert' : '= Gesamtbetrag'}
        hinweis={bearbeiten ? 'Leer lassen, um die aktuelle Restschuld zu behalten.' : 'Leer lassen, wenn noch nichts getilgt wurde.'}
      />

      <div className="space-y-1.5">
        <Label htmlFor="debt-creditor">{creditorLabel}</Label>
        <Input
          id="debt-creditor"
          name="creditor"
          className={FELD}
          placeholder="Name oder Institution"
          defaultValue={debt?.creditor ?? defaultValues?.creditor ?? ''}
        />
      </div>

      <details className="group rounded-md border border-border" open={hatZinsDaten}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Zinsen, Rate, Fälligkeit, Notiz
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-4 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <BetragEingabe id="debt-interest" name="interest_rate" label="Zinssatz (% p.a.)" startwert={debt?.interest_rate} platzhalter="0,00" />
            <BetragEingabe id="debt-rate" name="monthly_payment" label="Monatsrate" startwert={debt?.monthly_payment} platzhalter="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-due">Fällig am</Label>
            <Input id="debt-due" name="due_date" type="date" className={FELD} defaultValue={debt?.due_date ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-notes">Notizen</Label>
            <textarea
              id="debt-notes"
              name="notes"
              rows={2}
              defaultValue={debt?.notes ?? ''}
              placeholder="Optionale Anmerkungen…"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm"
            />
          </div>
        </div>
      </details>

      <Fehler state={state} />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="h-10 md:h-9" onClick={onAbbruch}>Abbrechen</Button>
        <Button type="submit" className="h-10 md:h-9" disabled={isPending}>
          {isPending ? 'Wird gespeichert…' : bearbeiten ? 'Speichern' : 'Anlegen'}
        </Button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────
// Add Debt Dialog
// ─────────────────────────────────────────────
interface AddDebtDialogProps {
  /** Vorausgefuellte Werte -- z.B. aus DebtSuggestion, wenn eine Buchung als "Schulden"
   * kategorisiert wurde und zu keiner bestehenden Schuld passt. */
  defaultValues?: {
    name?: string
    creditor?: string
    original_amount?: number
    type?: string
  }
  /** Eigener Ausloeser statt des Standard-"Schuld anlegen"-Buttons. */
  trigger?: ReactNode
  onCreated?: () => void
}

export function AddDebtDialog({ defaultValues, trigger, onCreated }: AddDebtDialogProps = {}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="h-10 md:h-9">
            <Plus className="size-4" />
            Schuld anlegen
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>Neue Schuld anlegen</DialogTitle>
          <DialogDescription className="sr-only">Geliehenes oder verliehenes Geld erfassen</DialogDescription>
        </DialogHeader>
        <SchuldFormular
          defaultValues={defaultValues}
          onFertig={() => { setOpen(false); onCreated?.() }}
          onAbbruch={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Edit Debt Dialog
// ─────────────────────────────────────────────
export function EditDebtDialog({ debt, className }: { debt: Debt; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-10 md:size-8', className)} aria-label={`${debt.name} bearbeiten`}>
          <Pencil className="size-4 md:size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle>Schuld bearbeiten</DialogTitle>
          <DialogDescription className="sr-only">{debt.name}</DialogDescription>
        </DialogHeader>
        <SchuldFormular debt={debt} onFertig={() => setOpen(false)} onAbbruch={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Delete Debt Button
// ─────────────────────────────────────────────
export function DeleteDebtButton({ debt, className }: { debt: Debt; className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDebt(debt.id)
      if (result.error) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={v => { setOpen(v); setError(null) }}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-10 text-muted-foreground hover:text-destructive md:size-8', className)}
          aria-label={`${debt.name} löschen`}
        >
          <Trash2 className="size-4 md:size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Schuld löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{debt.name}</strong> und alle Zahlungen werden unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className={FEHLER}>{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          {/* preventDefault: der Dialog bleibt bei einem Fehler offen und zeigt ihn an. */}
          <AlertDialogAction
            onClick={e => { e.preventDefault(); handleDelete() }}
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

// ─────────────────────────────────────────────
// Payment Dialog
// ─────────────────────────────────────────────
interface DebtPaymentDialogProps {
  debt: Debt
  /** Vorbelegung aus einer Buchung heraus (siehe DebtSuggestion). */
  defaultAmount?: number
  defaultDate?: string
  /** Verknuepft die entstehende Zahlung mit ihrer Quellbuchung -- siehe recordPayment. */
  sourceTransaction?: { id: string; source: 'manual' | 'bank_sync' }
  trigger?: ReactNode
  onRecorded?: () => void
}

function ZahlungFormular({
  debt, defaultAmount, defaultDate, sourceTransaction, onFertig, onAbbruch,
}: Omit<DebtPaymentDialogProps, 'trigger' | 'onRecorded'> & { onFertig: () => void; onAbbruch: () => void }) {
  const { locale } = useSettings()
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<DebtActionState, FormData>(recordPayment, null)
  // Der Betrag lässt sich auf die Restschuld setzen; der Schlüssel baut das Feld dafür neu auf.
  const [betrag, setBetrag] = useState<{ start: number | undefined; version: number }>({ start: defaultAmount, version: 0 })
  const heute = heuteBerlin()

  useEffect(() => {
    if (state && 'success' in state) {
      router.refresh()
      onFertig()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router])

  return (
    <form action={formAction} className="min-w-0 space-y-4">
      <input type="hidden" name="debt_id" value={debt.id} />
      {sourceTransaction && (
        <>
          <input type="hidden" name="source_transaction_id" value={sourceTransaction.id} />
          <input type="hidden" name="source_transaction_type" value={sourceTransaction.source} />
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pay-date">Datum *</Label>
          <Input id="pay-date" name="payment_date" type="date" className={FELD} defaultValue={defaultDate ?? heute} required />
        </div>
        <BetragEingabe key={betrag.version} id="pay-amount" name="amount" label="Betrag" startwert={betrag.start} pflicht />
      </div>
      <button
        type="button"
        onClick={() => setBetrag(b => ({ start: debt.outstanding, version: b.version + 1 }))}
        className="-mt-2 inline-flex min-h-10 items-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground md:min-h-6"
      >
        Restschuld einsetzen ({fmtCurrency(debt.outstanding, debt.currency, locale, { fractionDigits: 2 })})
      </button>

      <div className="grid grid-cols-2 gap-3">
        <BetragEingabe id="pay-principal" name="principal" label="davon Tilgung" platzhalter="—" />
        <BetragEingabe id="pay-interest" name="interest" label="davon Zinsen" platzhalter="—" />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Optional. Nur die Tilgung senkt die Restschuld; ohne Angabe zählt der ganze Betrag als Tilgung.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="pay-notes">Notiz</Label>
        <Input id="pay-notes" name="notes" className={FELD} placeholder="Optionale Anmerkung" />
      </div>

      <Fehler state={state} />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="h-10 md:h-9" onClick={onAbbruch}>Abbrechen</Button>
        <Button type="submit" className="h-10 md:h-9" disabled={isPending}>
          {isPending ? 'Wird gespeichert…' : 'Zahlung buchen'}
        </Button>
      </div>
    </form>
  )
}

export function DebtPaymentDialog({
  debt,
  defaultAmount,
  defaultDate,
  sourceTransaction,
  trigger,
  onRecorded,
}: DebtPaymentDialogProps) {
  const { locale } = useSettings()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="h-10 gap-1.5 md:h-8">
            <CreditCard className="size-3.5" />
            Zahlung
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={cn(DIALOG, 'sm:max-w-sm')}>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Zahlung erfassen</DialogTitle>
          <DialogDescription className="min-w-0 truncate">
            {debt.name} · offen{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {fmtCurrency(debt.outstanding, debt.currency, locale, { fractionDigits: 2 })}
            </span>
          </DialogDescription>
        </DialogHeader>
        <ZahlungFormular
          debt={debt}
          defaultAmount={defaultAmount}
          defaultDate={defaultDate}
          sourceTransaction={sourceTransaction}
          onFertig={() => { setOpen(false); onRecorded?.() }}
          onAbbruch={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Settle Debt Button — bucht den vollen ausstehenden Betrag als eine
// Zahlung über recordPayment, statt Betrag manuell einzutippen.
// ─────────────────────────────────────────────
export function SettleDebtButton({ debt }: { debt: Debt }) {
  const { locale } = useSettings()
  const fmt = (amount: number, currency: string) => fmtCurrency(amount, currency, locale, { fractionDigits: 2 })
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function handleSettle() {
    const formData = new FormData()
    formData.set('debt_id', debt.id)
    formData.set('payment_date', heuteBerlin())
    formData.set('amount', String(debt.outstanding))

    startTransition(async () => {
      const result = await recordPayment(null, formData)
      if (result && 'error' in result) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={v => { setOpen(v); setError(null) }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-10 gap-1.5 text-success hover:text-success md:h-8">
          <CheckCircle2 className="size-3.5" />
          Begleichen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Schuld vollständig begleichen?</AlertDialogTitle>
          <AlertDialogDescription>
            Bucht eine Zahlung über <strong className="tabular-nums">{fmt(debt.outstanding, debt.currency)}</strong> für{' '}
            <strong>{debt.name}</strong> und markiert die Schuld als abgeschlossen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className={FEHLER}>{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={e => { e.preventDefault(); handleSettle() }} disabled={isPending}>
            {isPending ? 'Wird gebucht…' : 'Begleichen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
