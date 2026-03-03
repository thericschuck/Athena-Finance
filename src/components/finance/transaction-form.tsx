'use client'

import { useActionState, useEffect, useState } from 'react'
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
import { Plus } from 'lucide-react'
import {
  createTransaction,
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
}

export function AddTransactionDialog({ accounts, categories }: AddTransactionDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Select values (need hidden inputs for Server Action)
  const [type, setType] = useState('expense')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [currency, setCurrency] = useState('EUR')

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
      setAccountId('')
      setCategoryId('')
      setCurrency('EUR')
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
                min="0"
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
