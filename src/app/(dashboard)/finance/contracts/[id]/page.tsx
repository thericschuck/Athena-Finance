import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { EditContractDialog, DeleteContractButton } from '@/components/finance/contract-form'
import { CONTRACT_TYPES, FREQUENCIES, TRANSFER_TYPES } from '@/lib/finance/contract-constants'
import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react'

type Contract    = Database['public']['Tables']['contracts']['Row'] & { to_account_id?: string | null }
type Transaction = Database['public']['Tables']['transactions']['Row']

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))

function toMonthly(amount: number, frequency: string): number {
  const map: Record<string, number> = {
    weekly: 52 / 12, biweekly: 26 / 12,
    monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
  }
  return amount * (map[frequency] ?? 1)
}

const TYPE_LABEL   = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
const FREQ_LABEL   = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: contract },
    { data: transactions },
    { data: accounts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('contracts').select('*').eq('id', id).eq('user_id', user!.id).single(),
    supabase.from('transactions').select('*').eq('contract_id', id).eq('user_id', user!.id)
      .order('date', { ascending: false }),
    supabase.from('accounts').select('id, name').eq('user_id', user!.id).order('sort_order'),
    supabase.from('categories').select('id, name').eq('user_id', user!.id).order('name'),
  ])

  if (!contract) notFound()

  const c = contract as Contract
  const txs = (transactions ?? []) as Transaction[]
  const accs = accounts ?? []
  const cats = categories ?? []

  const isTransfer  = TRANSFER_TYPES.has(c.type)
  const fromAccount = accs.find(a => a.id === c.account_id)
  const toAccount   = accs.find(a => a.id === c.to_account_id)
  const category    = cats.find(a => a.id === c.category_id)

  const monthlyEur  = c.currency === 'EUR' ? toMonthly(c.amount, c.frequency) : null
  const totalBooked = txs.reduce((s, t) => s + t.amount, 0)

  const isExpired = c.end_date && c.notice_days
    ? new Date(c.end_date).getTime() - c.notice_days * 86400000 <= Date.now()
    : false

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Back nav */}
      <Link
        href="/finance/contracts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Alle Verträge
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            {!c.is_active && (
              <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Inaktiv</span>
            )}
            {c.is_active && isExpired && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                <AlertTriangle className="size-3" />Kündigung überfällig
              </span>
            )}
            {c.is_active && c.auto_renews && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="size-3" />Auto-Verlängerung
              </span>
            )}
          </div>
          {c.provider && <p className="mt-0.5 text-sm text-muted-foreground">{c.provider}</p>}
        </div>
        <div className="flex items-center gap-2">
          <EditContractDialog contract={c} accounts={accs} categories={cats} />
          <DeleteContractButton contract={c} />
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InfoCard label="Betrag" value={`${fmtEur(c.amount, c.currency)} / ${FREQ_LABEL[c.frequency] ?? c.frequency}`} />
        {monthlyEur !== null && (
          <InfoCard label="Monatlich" value={fmtEur(monthlyEur)} />
        )}
        <InfoCard label="Typ" value={TYPE_LABEL[c.type] ?? c.type} />
        {isTransfer ? (
          <InfoCard
            label="Überweisung"
            value={`${fromAccount?.name ?? '—'} → ${toAccount?.name ?? '—'}`}
          />
        ) : (
          <InfoCard label="Konto" value={fromAccount?.name ?? '—'} />
        )}
        <InfoCard label="Startdatum" value={fmtDate(c.start_date)} />
        {c.end_date && <InfoCard label="Enddatum" value={fmtDate(c.end_date)} />}
        {c.notice_days > 0 && <InfoCard label="Kündigungsfrist" value={`${c.notice_days} Tage`} />}
        {category && <InfoCard label="Kategorie" value={category.name} />}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Gebuchte Transaktionen</p>
          <p className="text-2xl font-semibold tabular-nums">{txs.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
          <p className="text-2xl font-semibold tabular-nums">{fmtEur(totalBooked, c.currency)}</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Transaktionen ({txs.length})
        </h2>

        {txs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Noch keine Transaktionen — der Cron-Job bucht täglich automatisch.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Datum</th>
                  <th className="text-left px-4 py-2.5 font-medium">Beschreibung</th>
                  <th className="text-right px-4 py-2.5 font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {txs.map(tx => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtDate(tx.date)}
                    </td>
                    <td className="px-4 py-3">
                      {tx.description ?? c.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      <span className={tx.type === 'expense' ? 'text-red-600 dark:text-red-400' : ''}>
                        {tx.type === 'expense' ? '−' : ''}{fmtEur(tx.amount, tx.currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {c.notes && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {c.notes}
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
