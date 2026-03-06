import { createClient } from '@/lib/supabase/server'
import { AddTransactionDialog, EditTransactionDialog, DeleteTransactionButton } from '@/components/finance/transaction-form'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Database } from '@/types/database'

type TxRow = Database['public']['Tables']['transactions']['Row']
type Account = { id: string; name: string; color: string | null; currency: string }
type Category = { id: string; name: string; color: string | null }

type TransactionWithRelations = TxRow & {
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; color: string | null } | null
}

interface PageProps {
  searchParams: Promise<{
    type?: string
    account?: string
    category?: string
    from?: string
    to?: string
  }>
}

const TYPE_CONFIG: Record<string, { label: string; classes: string }> = {
  expense:    { label: 'Ausgabe',     classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  income:     { label: 'Einnahme',    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  transfer:   { label: 'Transfer',    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  investment: { label: 'Investition', classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
}

function formatAmount(amount: number, currency: string, type: string) {
  const sign = type === 'income' ? '+' : type === 'expense' ? '-' : ''
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: ['BTC', 'ETH'].includes(currency) ? 'EUR' : currency,
    minimumFractionDigits: 2,
  }).format(amount)
  // For crypto, replace currency symbol with ticker
  const display = ['BTC', 'ETH'].includes(currency)
    ? `${amount.toFixed(6)} ${currency}`
    : formatted
  return { sign, display }
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(
    new Date(dateStr)
  )
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Load accounts + categories for dropdowns and filter bar
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, color, currency')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, name, color')
      .eq('user_id', user!.id)
      .order('sort_order'),
  ])

  // Build transactions query with optional filters
  let query = supabase
    .from('transactions')
    .select(
      `*, account:accounts!transactions_account_id_fkey(id, name, color), category:categories(id, name, color)`
    )
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.account) query = query.eq('account_id', filters.account)
  if (filters.category) query = query.eq('category_id', filters.category)
  if (filters.from) query = query.gte('date', filters.from)
  if (filters.to) query = query.lte('date', filters.to)

  const { data: transactions } = await query

  const rows = (transactions ?? []) as TransactionWithRelations[]

  return (
    <div className="p-4 sm:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transaktionen</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length} Einträge
            {Object.values(filters).some(Boolean) && ' (gefiltert)'}
          </p>
        </div>
        <AddTransactionDialog
          accounts={accounts ?? []}
          categories={categories ?? []}
        />
      </div>

      {/* Filters */}
      <TransactionFilters
        accounts={accounts ?? []}
        categories={categories ?? []}
      />

      {/* Table */}
      {rows.length === 0 ? (
        <EmptyState hasFilters={Object.values(filters).some(Boolean)} />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Datum</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Konto</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Kategorie</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Beschreibung</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} accounts={accounts ?? []} categories={categories ?? []} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TransactionRow({ tx, accounts, categories }: { tx: TransactionWithRelations; accounts: Account[]; categories: Category[] }) {
  const typeCfg = TYPE_CONFIG[tx.type] ?? { label: tx.type, classes: 'bg-muted text-muted-foreground' }
  const { sign, display } = formatAmount(tx.amount, tx.currency, tx.type)

  const amountColor =
    tx.type === 'income'
      ? 'text-green-600 dark:text-green-400'
      : tx.type === 'expense'
      ? 'text-red-600 dark:text-red-400'
      : 'text-foreground'

  return (
    <tr className="group hover:bg-muted/30 transition-colors">
      {/* Datum */}
      <td className="px-4 py-3 text-muted-foreground tabular-nums">
        {formatDate(tx.date)}
      </td>

      {/* Typ */}
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeCfg.classes}`}>
          {typeCfg.label}
        </span>
      </td>

      {/* Konto */}
      <td className="px-4 py-3">
        {tx.account ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: tx.account.color ?? '#94a3b8' }}
            />
            <span className="text-muted-foreground">{tx.account.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Kategorie */}
      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
        {tx.category?.name ?? '—'}
      </td>

      {/* Beschreibung / Händler */}
      <td className="px-4 py-3 max-w-xs hidden md:table-cell">
        <span className="truncate block text-foreground">
          {tx.merchant || tx.description || <span className="text-muted-foreground">—</span>}
        </span>
        {tx.merchant && tx.description && (
          <span className="text-xs text-muted-foreground truncate block">{tx.description}</span>
        )}
      </td>

      {/* Betrag */}
      <td className={`px-4 py-3 text-right font-medium tabular-nums ${amountColor}`}>
        {sign}{display}
      </td>

      {/* Aktionen */}
      <td className="px-2 py-3">
        <span className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <EditTransactionDialog tx={tx} accounts={accounts} categories={categories} />
          <DeleteTransactionButton tx={tx} />
        </span>
      </td>
    </tr>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? 'Keine Treffer für diese Filter' : 'Noch keine Transaktionen'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters
          ? 'Passe die Filter an oder setze sie zurück.'
          : 'Erfasse deine erste Transaktion.'}
      </p>
    </div>
  )
}
