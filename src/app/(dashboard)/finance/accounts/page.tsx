import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AddAccountDialog, EditAccountDialog, DeleteAccountButton } from '@/components/finance/account-form'
import { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_LABELS: Record<string, string> = {
  checking:         'Girokonto',
  savings:          'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment:       'Depot',
  crypto:           'Krypto',
  cash:             'Bargeld',
  credit:           'Kreditkarte',
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Konten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Verwalte deine Bankkonten und Depots
          </p>
        </div>
        <AddAccountDialog />
      </div>

      {/* Table */}
      {!accounts || accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <AccountTable accounts={accounts} />
      )}
    </div>
  )
}

function AccountTable({ accounts }: { accounts: Account[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Institution</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Währung</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccountRow({ account }: { account: Account }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors group">
      {/* Name + color dot */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{ backgroundColor: account.color ?? '#94a3b8' }}
          />
          <Link
              href={`/finance/accounts/${account.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {account.name}
            </Link>
        </div>
      </td>

      {/* Typ */}
      <td className="px-4 py-3 text-muted-foreground">
        {TYPE_LABELS[account.type] ?? account.type}
      </td>

      {/* Institution */}
      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
        {account.institution ?? '—'}
      </td>

      {/* Währung */}
      <td className="px-4 py-3">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {account.currency}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            account.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {account.is_active ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <EditAccountDialog account={account} />
          <DeleteAccountButton account={account} />
        </div>
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Konten</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Füge dein erstes Konto hinzu, um loszulegen.
      </p>
    </div>
  )
}
