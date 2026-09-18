'use client'

import { useActionState, useEffect, useReducer, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArrowLeftRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createTransaction,
  updateTransaction,
  updateTransactionCategory,
  deleteTransaction,
  type TransactionActionState,
} from '@/app/(dashboard)/finance/(transaktionen)/transactions/actions'
import { DebtSuggestion } from '@/components/finance/debt-suggestion'
import { groupCategoriesByParent } from '@/lib/finance/category-groups'
import { Database } from '@/types/database'

type Account = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'name' | 'color' | 'currency'
>
type Category = Pick<
  Database['public']['Tables']['categories']['Row'],
  'id' | 'name' | 'color' | 'icon' | 'parent_id'
>
type TxRow = Database['public']['Tables']['transactions']['Row']
type Debt = Database['public']['Tables']['debts']['Row']

const NO_CATEGORY = '__none__'

function categoryLabel(c: Category): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

function CategoryDot({ color }: { color: string | null }) {
  return (
    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color ?? '#94a3b8' }} />
  )
}

/**
 * Händler/Beschreibung einer Buchung -- standardmässig einzeilig abgeschnitten, damit die
 * Tabelle nicht ausufert. Bank-Verwendungszwecke sind oft deutlich länger als die Spalte
 * (IBAN, Uhrzeit, Referenznummer, ...), deshalb per Klick als Popover vollständig lesbar.
 */
export function TransactionDescriptionCell({
  merchant,
  description,
  badge,
}: {
  merchant: string | null
  description: string | null
  badge?: React.ReactNode
}) {
  const primary = merchant || description
  const hasSecondary = !!(merchant && description)

  if (!primary) return <span className="text-muted-foreground">—</span>

  return (
    <Popover>
      <PopoverTrigger className="block w-full min-w-0 text-left cursor-pointer">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-foreground">{primary}</span>
          {badge}
        </span>
        {hasSecondary && (
          <span className="text-xs text-muted-foreground truncate block">{description}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-1 text-sm">
        <p className="font-medium text-foreground break-words">{merchant || description}</p>
        {hasSecondary && (
          <p className="text-muted-foreground whitespace-pre-wrap break-words">{description}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Kategorien-Optionen nach Hauptkategorie gruppiert statt flach -- bei 30+ Kategorien war die
 * Reihenfolge sonst praktisch zufällig (fast alle haben `sort_order = 0`). Die Hauptkategorie
 * bleibt selbst wählbar (manche Buchungen hängen direkt an ihr, ohne Unterkategorie), ihre
 * Kinder folgen darunter eingerückt.
 */
function CategorySelectOptions({ categories }: { categories: Category[] }) {
  const groups = groupCategoriesByParent(categories)
  return (
    <>
      {groups.map(({ parent, children }, i) => (
        <SelectGroup key={parent.id}>
          {i > 0 && <SelectSeparator />}
          <SelectItem value={parent.id}>
            <span className="flex items-center gap-2">
              <CategoryDot color={parent.color} />
              {categoryLabel(parent)}
            </span>
          </SelectItem>
          {children.map((c) => (
            <SelectItem key={c.id} value={c.id} className="pl-6">
              <span className="flex items-center gap-2">
                <CategoryDot color={c.color} />
                {categoryLabel(c)}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  )
}

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH']

interface AddTransactionDialogProps {
  accounts: Account[]
  categories: Category[]
  defaultAccountId?: string
  /** Aktive Schulden + die ID der Kategorie "Schulden" -- fuer den Vorschlag nach dem Speichern,
   * siehe DebtSuggestion. Ohne schuldenCategoryId bleibt der Vorschlag stumm. */
  debts?: Debt[]
  schuldenCategoryId?: string | null
}

/** Snapshot der fuer DebtSuggestion relevanten Felder, aus dem Formular genommen, BEVOR die
 * Server Action abgeschickt wird -- danach ist die FormData weg, aber die frisch vergebene ID
 * kommt erst mit dem Ergebnis der Action zurueck. */
type TxSnapshot = {
  amount: number
  date: string
  description: string | null
  merchant: string | null
  direction: 'expense' | 'income'
}

function snapshotFromForm(form: HTMLFormElement): TxSnapshot {
  const fd = new FormData(form)
  const raw = parseFloat((fd.get('amount') as string) || '0')
  return {
    amount: Math.abs(raw),
    date: (fd.get('date') as string) ?? '',
    description: (fd.get('description') as string) || null,
    merchant: (fd.get('merchant') as string) || null,
    direction: raw >= 0 ? 'income' : 'expense',
  }
}

// ─── Grouped form state ────────────────────────────────────────────────────────
// accountId/categoryId/currency/isTransfer/transferTo all change together
// (e.g. on open/reset), so they're modeled as one reducer instead of 5 useState calls.
type TxFormState = {
  accountId:   string
  categoryId:  string
  currency:    string
  isTransfer:  boolean
  transferTo:  string
}

type TxFormAction =
  | { type: 'set'; field: 'accountId' | 'categoryId' | 'transferTo'; value: string }
  | { type: 'setCurrency'; value: string }
  | { type: 'toggleTransfer' }
  | { type: 'reset'; accountId: string; currency: string }

function txFormReducer(state: TxFormState, action: TxFormAction): TxFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value }
    case 'setCurrency':
      return { ...state, currency: action.value }
    case 'toggleTransfer':
      return { ...state, isTransfer: !state.isTransfer, transferTo: '' }
    case 'reset':
      return { accountId: action.accountId, categoryId: '', currency: action.currency, isTransfer: false, transferTo: '' }
  }
}

function currencyForAccount(accountId: string | undefined, accounts: Account[]): string {
  const acc = accountId ? accounts.find((a) => a.id === accountId) : undefined
  return acc?.currency ?? 'EUR'
}

export function AddTransactionDialog({ accounts, categories, defaultAccountId, debts = [], schuldenCategoryId = null }: AddTransactionDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Gesetzt, sobald eine als "Schulden" kategorisierte Buchung gespeichert wurde -- ersetzt
  // dann das Formular durch den DebtSuggestion-Vorschlag, statt den Dialog sofort zu schliessen.
  const [savedTx, setSavedTx] = useState<(TxSnapshot & { id: string }) | null>(null)
  const pendingSnapshot = useRef<TxSnapshot | null>(null)

  const [form, dispatch] = useReducer(txFormReducer, defaultAccountId, (accId) => ({
    accountId:  accId ?? '',
    categoryId: '',
    currency:   currencyForAccount(accId, accounts),
    isTransfer: false,
    transferTo: '',
  }))
  const { accountId, categoryId, currency, isTransfer, transferTo } = form

  const [state, formAction, isPending] = useActionState<TransactionActionState, FormData>(
    createTransaction,
    null
  )

  // Nach dem Speichern: bei "Schulden" bleibt der Dialog offen und zeigt den Vorschlag; sonst
  // wie zuvor sofort schliessen.
  useEffect(() => {
    if (state && 'success' in state) {
      router.refresh()
      if (state.id && schuldenCategoryId && categoryId === schuldenCategoryId && pendingSnapshot.current) {
        setSavedTx({ ...pendingSnapshot.current, id: state.id })
      } else {
        setOpen(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router])

  // Auto-fill currency from selected account
  useEffect(() => {
    const account = accounts.find((a) => a.id === accountId)
    if (account) dispatch({ type: 'setCurrency', value: account.currency })
  }, [accountId, accounts])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      dispatch({ type: 'reset', accountId: defaultAccountId ?? '', currency: currencyForAccount(defaultAccountId, accounts) })
      setSavedTx(null)
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

        {savedTx ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Transaktion gespeichert.</p>
            <DebtSuggestion
              transactionId={savedTx.id}
              source="manual"
              amount={savedTx.amount}
              date={savedTx.date}
              description={savedTx.description}
              merchant={savedTx.merchant}
              direction={savedTx.direction}
              debts={debts}
              onHandled={() => setOpen(false)}
            />
            <div className="flex justify-end pt-2">
              <Button type="button" size="sm" onClick={() => setOpen(false)}>Schließen</Button>
            </div>
          </div>
        ) : (
        <form
          action={formAction}
          onSubmit={(e) => { pendingSnapshot.current = snapshotFromForm(e.currentTarget) }}
          className="space-y-4 pt-2"
        >
          {/* Hidden select values */}
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="is_transfer" value={isTransfer ? 'true' : ''} />
          {isTransfer && <input type="hidden" name="transfer_to" value={transferTo} />}

          {/* Datum + Betrag + Währung */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Datum *</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Betrag *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                placeholder="-50,00 / +50,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Währung *</Label>
              <Select value={currency} onValueChange={(v) => dispatch({ type: 'setCurrency', value: v })}>
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

          {/* Konto */}
          <div className="space-y-1.5">
            <Label>Konto *</Label>
            <Select value={accountId} onValueChange={(v) => dispatch({ type: 'set', field: 'accountId', value: v })}>
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

          {/* Kategorie */}
          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={(v) => dispatch({ type: 'set', field: 'categoryId', value: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen…" />
              </SelectTrigger>
              <SelectContent>
                <CategorySelectOptions categories={categories} />
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

          {/* Transfer toggle */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'toggleTransfer' })}
              className={`flex items-center gap-1.5 text-xs hover:text-foreground transition-colors ${isTransfer ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <ArrowLeftRight className="size-3.5" />
              Transfer zwischen Konten
            </button>
            {isTransfer && (
              <Select value={transferTo} onValueChange={(v) => dispatch({ type: 'set', field: 'transferTo', value: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Zielkonto wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
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
            )}
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
        )}
      </DialogContent>
    </Dialog>
  )
}

export function EditTransactionDialog({
  tx,
  accounts,
  categories,
  debts = [],
  schuldenCategoryId = null,
}: {
  tx: TxRow
  accounts: Account[]
  categories: Category[]
  debts?: Debt[]
  schuldenCategoryId?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [accountId, setAccountId] = useState(tx.account_id)
  const [categoryId, setCategoryId] = useState(tx.category_id ?? '')
  const [currency, setCurrency] = useState(tx.currency)
  const [isTransfer, setIsTransfer] = useState(tx.type === 'transfer')
  const [transferTo, setTransferTo] = useState((tx as TxRow & { transfer_to?: string }).transfer_to ?? '')

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

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Re-seed the editable copy from the latest tx prop every time the dialog
      // opens, so a stale snapshot from an earlier mount doesn't linger after
      // this row's data has since been refreshed (e.g. after a prior edit).
      setAccountId(tx.account_id)
      setCategoryId(tx.category_id ?? '')
      setCurrency(tx.currency)
      setIsTransfer(tx.type === 'transfer')
      setTransferTo((tx as TxRow & { transfer_to?: string }).transfer_to ?? '')
    }
  }

  // Derive display amount: for expense the stored amount is positive but sign is negative
  const displayAmount = tx.type === 'expense' ? -tx.amount : tx.amount

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="is_transfer" value={isTransfer ? 'true' : ''} />
          {isTransfer && <input type="hidden" name="transfer_to" value={transferTo} />}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Datum *</Label>
              <Input id="e-date" name="date" type="date" defaultValue={tx.date} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Betrag *</Label>
              <Input
                id="e-amount"
                name="amount"
                type="number"
                step="0.01"
                placeholder="-50,00 / +50,00"
                defaultValue={displayAmount}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Währung *</Label>
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
            <Label>Konto *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
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

          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
              <SelectContent>
                <CategorySelectOptions categories={categories} />
              </SelectContent>
            </Select>
            {schuldenCategoryId && categoryId === schuldenCategoryId && (
              <div className="pt-1.5">
                <DebtSuggestion
                  transactionId={tx.id}
                  source="manual"
                  amount={Math.abs(tx.amount)}
                  date={tx.date}
                  description={tx.description}
                  merchant={tx.merchant}
                  direction={tx.type === 'income' ? 'income' : 'expense'}
                  debts={debts}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-description">Beschreibung</Label>
              <Input id="e-description" name="description" defaultValue={tx.description ?? ''} placeholder="z.B. Monatsbeitrag" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-merchant">Händler</Label>
              <Input id="e-merchant" name="merchant" defaultValue={tx.merchant ?? ''} placeholder="z.B. Rewe, Amazon" />
            </div>
          </div>

          {/* Transfer toggle */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setIsTransfer(!isTransfer)
                setTransferTo('')
              }}
              className={`flex items-center gap-1.5 text-xs hover:text-foreground transition-colors ${isTransfer ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <ArrowLeftRight className="size-3.5" />
              Transfer zwischen Konten
            </button>
            {isTransfer && (
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Zielkonto wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
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
            )}
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

// Inline, optimistic category picker for the transactions table — changing a category used to
// mean opening the full Edit dialog, resubmitting every field, and waiting for a full page
// refresh just to update one value. This updates instantly and only talks to the server in the
// background (matching the Banking tab's inline category Select), with a rollback + toast if
// the background save fails. `source` picks manual `transactions` vs. bank-synced
// `bank_transactions` — see `updateTransactionCategory`.
export function TransactionCategorySelect({
  tx,
  categories,
  debts = [],
  schuldenCategoryId = null,
}: {
  tx: {
    id: string
    category_id: string | null
    source: 'manual' | 'bank_sync'
    amount?: number
    date?: string
    description?: string | null
    merchant?: string | null
    type?: string
  }
  categories: Category[]
  debts?: Debt[]
  schuldenCategoryId?: string | null
}) {
  const [categoryId, setCategoryId] = useState(tx.category_id ?? NO_CATEGORY)
  const [, startTransition] = useTransition()
  // Nur nach einer aktiven Auswahl in DIESER Sitzung zeigen -- sonst wuerde jede bereits vor
  // dem Laden "Schulden"-kategorisierte Buchung dauerhaft einen Vorschlag anzeigen, und genau
  // dieses Nachtraeglich-durchforsten der Bank-Buchungen war bewusst nicht der Umfang.
  const [justChanged, setJustChanged] = useState(false)

  const current = categories.find(c => c.id === categoryId)

  function handleChange(next: string) {
    const previous = categoryId
    setCategoryId(next)
    setJustChanged(next !== previous && next === schuldenCategoryId)
    startTransition(async () => {
      const result = await updateTransactionCategory(tx.id, next === NO_CATEGORY ? null : next, tx.source)
      if (result.error) {
        setCategoryId(previous)
        setJustChanged(false)
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Select value={categoryId} onValueChange={handleChange}>
        <SelectTrigger
          size="sm"
          aria-label="Kategorie ändern"
          className="h-7 max-w-[160px] rounded-full border-none px-2.5 text-xs shadow-none"
          style={current?.color ? { backgroundColor: `${current.color}1a`, color: current.color } : undefined}
        >
          <SelectValue placeholder="Kategorisieren…">
            {current ? categoryLabel(current) : 'Ohne Kategorie'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>Ohne Kategorie</SelectItem>
          <CategorySelectOptions categories={categories} />
        </SelectContent>
      </Select>
      {justChanged && schuldenCategoryId && categoryId === schuldenCategoryId && (
        <div className="mt-1.5 max-w-xs">
          <DebtSuggestion
            transactionId={tx.id}
            source={tx.source}
            amount={Math.abs(tx.amount ?? 0)}
            date={tx.date ?? ''}
            description={tx.description ?? null}
            merchant={tx.merchant ?? null}
            direction={tx.type === 'income' ? 'income' : 'expense'}
            debts={debts}
            onHandled={() => setJustChanged(false)}
          />
        </div>
      )}
    </>
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
