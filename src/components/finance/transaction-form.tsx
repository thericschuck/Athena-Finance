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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionActionState,
} from '@/app/(dashboard)/finance/transactions/actions'
import { Database } from '@/types/database'

type Account = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'name' | 'color' | 'currency'
>
type Category = Pick<
  Database['public']['Tables']['categories']['Row'],
  'id' | 'name' | 'color'
>
type TxRow = Database['public']['Tables']['transactions']['Row']

const TRANSACTION_TYPES = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Investition' },
]

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH']

interface AddTransactionDialogProps {
  accounts: Account[]
  categories: Category[]
  defaultAccountId?: string
}

export function AddTransactionDialog({ accounts, categories, defaultAccountId }: AddTransactionDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Select values (need hidden inputs for Server Action)
  const [type, setType] = useState('expense')
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [currency, setCurrency] = useState(() => {
    if (defaultAccountId) {
      const acc = accounts.find((a) => a.id === defaultAccountId)
      if (acc) return acc.currency
    }
    return 'EUR'
  })

  const [state, formAction, isPending] = useActionState<TransactionActionState, FormData>(
    createTransaction,
    null
  )

  // Close + refresh on success
  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  // Auto-fill currency from selected account
  useEffect(() => {
    const account = accounts.find((a) => a.id === accountId)
    if (account) setCurrency(account.currency)
  }, [accountId, accounts])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setType('expense')
      setAccountId(defaultAccountId ?? '')
      setCategoryId('')
      const acc = defaultAccountId ? accounts.find((a) => a.id === defaultAccountId) : null
      setCurrency(acc?.currency ?? 'EUR')
    }
  }

  // Today in YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Transaktion erfassen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Transaktion</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          {/* Hidden select values */}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="currency" value={currency} />

          {/* Datum + Typ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Datum *</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label>Typ *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Konto */}
          <div className="space-y-1.5">
            <Label>Konto *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Konto wählen…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: a.color ?? '#94a3b8' }}
                      />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Betrag + Währung */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Betrag *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Währung *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kategorie */}
          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Beschreibung + Händler */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="description">Beschreibung</Label>
              <Input id="description" name="description" placeholder="z.B. Monatsbeitrag" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merchant">Händler</Label>
              <Input id="merchant" name="merchant" placeholder="z.B. Rewe, Amazon" />
            </div>
          </div>

          {/* Error */}
          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditTransactionDialog({
  tx,
  accounts,
  categories,
}: {
  tx: TxRow
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [type, setType] = useState(tx.type)
  const [accountId, setAccountId] = useState(tx.account_id)
  const [categoryId, setCategoryId] = useState(tx.category_id ?? '')
  const [currency, setCurrency] = useState(tx.currency)

  const [state, formAction, isPending] = useActionState<TransactionActionState, FormData>(
    updateTransaction,
    null
  )

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transaktion bearbeiten</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="id" value={tx.id} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="currency" value={currency} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Datum *</Label>
              <Input id="e-date" name="date" type="date" defaultValue={tx.date} required />
            </div>
            <div className="space-y-1.5">
              <Label>Typ *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Konto *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Konto waehlen" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: a.color ?? '#94a3b8' }} />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Betrag *</Label>
              <Input id="e-amount" name="amount" type="number" step="0.01" defaultValue={tx.amount} required />
            </div>
            <div className="space-y-1.5">
              <Label>Waehrung *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Kategorie waehlen" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-description">Beschreibung</Label>
              <Input id="e-description" name="description" defaultValue={tx.description ?? ''} placeholder="z.B. Monatsbeitrag" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-merchant">Haendler</Label>
              <Input id="e-merchant" name="merchant" defaultValue={tx.merchant ?? ''} placeholder="z.B. Rewe, Amazon" />
            </div>
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending
                ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Wird gespeichert...</>
                : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteTransactionButton({ tx }: { tx: TxRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTransaction(tx.id)
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
          <AlertDialogTitle>Transaktion loeschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Diese Transaktion wird unwiderruflich geloescht.
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
            {isPending ? 'Wird geloescht...' : 'Loeschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
