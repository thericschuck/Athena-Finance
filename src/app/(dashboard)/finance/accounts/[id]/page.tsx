import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AddTransactionDialog, EditTransactionDialog, DeleteTransactionButton } from '@/components/finance/transaction-form'
import { AccountBalanceChart, type AccountBalancePoint } from '@/components/finance/account-balance-chart'
import { Database } from '@/types/database'
import { ChevronLeft } from 'lucide-react'

type TxRow = Database['public']['Tables']['transactions']['Row']
type Account = { id: string; name: string; color: string | null; currency: string }
type Category = { id: string; name: string; color: string | null }

type TransactionWithRelations = TxRow & {
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; color: string | null } | null
}

const TYPE_LABELS: Record<string, string> = {
  checking:         'Girokonto',
  savings:          'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment:       'Depot',
  crypto:           'Krypto',
  cash:             'Bargeld',
  credit:           'Kreditkarte',
  other:            'Sonstiges',
}

const TYPE_CONFIG: Record<string, { label: string; classes: string }> = {
  expense:    { label: 'Ausgabe',     classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  income:     { label: 'Einnahme',    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  transfer:   { label: 'Transfer',    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  investment: { label: 'Investition', classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
}

function formatAmount(amount: number, currency: string, type: string, locale: string) {
  const sign = type === 'income' ? '+' : type === 'expense' ? '-' : ''
  const display = ['BTC', 'ETH'].includes(currency)
    ? `${amount.toFixed(6)} ${currency}`
    : fmtCurrency(amount, currency, locale, { fractionDigits: 2 })
  return { sign, display }
}

function formatCurrency(amount: number, currency: string, locale: string) {
  if (['BTC', 'ETH'].includes(currency)) return `${amount.toFixed(6)} ${currency}`
  return fmtCurrency(amount, currency, locale, { fractionDigits: 2 })
}

function formatDate(dateStr: string, dateFormat: string) {
  return fmtDate(dateStr, dateFormat)
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: account }, { data: accounts }, { data: categories }, { data: transactions }, { data: balanceHistory }, settings] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user!.id)
      .single(),
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
    supabase
      .from('transactions')
      .select(`*, account:accounts!transactions_account_id_fkey(id, name, color), category:categories(id, name, color)`)
      .eq('user_id', user!.id)
      .eq('account_id', id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('account_balances')
      .select('snapshot_date, balance')
      .eq('account_id', id)
      .order('snapshot_date'),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  if (!account) notFound()

  const rows = (transactions ?? []) as TransactionWithRelations[]
  const currency = account.currency

  const income  = rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net     = income - expense

  const balancePoints: AccountBalancePoint[] = (balanceHistory ?? []).map(b => ({
    snapshot_date: b.snapshot_date,
    balance:       b.balance,
  }))

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Back link */}
      <Link
        href="/finance/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" />
        Alle Konten
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="size-4 rounded-full shrink-0"
            style={{ backgroundColor: account.color ?? '#94a3b8' }}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {TYPE_LABELS[account.type] ?? account.type}
              {account.institution ? ` · ${account.institution}` : ''}
              {' · '}{currency}
            </p>
          </div>
        </div>
        <AddTransactionDialog
          accounts={accounts ?? []}
          categories={categories ?? []}
          defaultAccountId={id}
        />
      </div>

      {/* Balance chart */}
      <AccountBalanceChart points={balancePoints} currency={currency} />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Einnahmen" value={formatCurrency(income, currency, locale)} color="text-green-600 dark:text-green-400" />
        <SummaryCard label="Ausgaben"  value={formatCurrency(expense, currency, locale)} color="text-red-600 dark:text-red-400" />
        <SummaryCard
          label="Saldo"
          value={`${net >= 0 ? '+' : ''}${formatCurrency(net, currency, locale)}`}
          color={net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
        />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">Noch keine Transaktionen</p>
          <p className="mt-1 text-sm text-muted-foreground">Erfasse die erste Transaktion für dieses Konto.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-32">Datum</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kategorie</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Beschreibung</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} accounts={accounts ?? []} categories={categories ?? []} locale={locale} dateFormat={dateFormat} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function TransactionRow({ tx, accounts, categories, locale, dateFormat }: { tx: TransactionWithRelations; accounts: Account[]; categories: Category[]; locale: string; dateFormat: string }) {
  const typeCfg = TYPE_CONFIG[tx.type] ?? { label: tx.type, classes: 'bg-muted text-muted-foreground' }
  const { sign, display } = formatAmount(tx.amount, tx.currency, tx.type, locale)
  const amountColor =
    tx.type === 'income'   ? 'text-green-600 dark:text-green-400'
    : tx.type === 'expense' ? 'text-red-600 dark:text-red-400'
    : 'text-foreground'

  return (
    <tr className="group hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(tx.date, dateFormat)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeCfg.classes}`}>
          {typeCfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{tx.category?.name ?? '—'}</td>
      <td className="px-4 py-3 max-w-xs">
        <span className="truncate block text-foreground">
          {tx.merchant || tx.description || <span className="text-muted-foreground">—</span>}
        </span>
        {tx.merchant && tx.description && (
          <span className="text-xs text-muted-foreground truncate block">{tx.description}</span>
        )}
      </td>
      <td className={`px-4 py-3 text-right font-medium tabular-nums ${amountColor}`}>
        {sign}{display}
      </td>
      <td className="px-2 py-3">
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditTransactionDialog tx={tx} accounts={accounts} categories={categories} />
          <DeleteTransactionButton tx={tx} />
        </span>
      </td>
    </tr>
  )
}
