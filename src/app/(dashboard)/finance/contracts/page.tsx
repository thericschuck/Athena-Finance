import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import {
  AddContractDialog,
  EditContractDialog,
  DeleteContractButton,
} from '@/components/finance/contract-form'
import { CONTRACT_TYPES, FREQUENCIES, TRANSFER_TYPES } from '@/lib/finance/contract-constants'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Contract = Database['public']['Tables']['contracts']['Row']

// ─── Date utilities ───────────────────────────────────────────────────────────
function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function nextBillingDate(startDate: string, frequency: string): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  if (start > today) return start

  const intervalDays: Record<string, number> = { weekly: 7, biweekly: 14 }
  const intervalMonths: Record<string, number> = {
    monthly: 1, quarterly: 3, biannual: 6, yearly: 12,
  }

  if (intervalDays[frequency]) {
    const days = intervalDays[frequency]
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
    const periods = Math.floor(diff / days)
    const next = new Date(start)
    next.setDate(next.getDate() + (periods + 1) * days)
    return next
  }

  const months = intervalMonths[frequency] ?? 1
  const monthsDiff =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth())
  const skip = Math.max(0, Math.floor(monthsDiff / months))
  const next = addMonths(start, skip * months)
  // Fine-tune: advance until strictly after today
  while (next <= today) {
    next.setMonth(next.getMonth() + months)
  }
  return next
}

/** true when the notice deadline for cancellation has passed */
function isNoticeExpired(contract: Contract): boolean {
  if (!contract.end_date || contract.notice_days == null) return false
  const end = new Date(contract.end_date)
  const deadline = new Date(end)
  deadline.setDate(deadline.getDate() - contract.notice_days)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return deadline <= today
}

/** Normalise any amount to a monthly equivalent */
function toMonthly(amount: number, frequency: string): number {
  const map: Record<string, number> = {
    weekly: 52 / 12, biweekly: 26 / 12,
    monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
  }
  return amount * (map[frequency] ?? 1)
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_ORDER = [
  'subscription', 'insurance', 'utility', 'loan', 'rental',
  'transfer', 'savings_plan', 'building_savings',
  'service', 'other',
]

const TYPE_LABEL = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: contracts }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from('contracts').select('*').eq('user_id', user!.id)
      .order('name', { ascending: true }),
    supabase.from('accounts').select('id, name').eq('user_id', user!.id).order('sort_order'),
    supabase.from('categories').select('id, name').eq('user_id', user!.id).order('name'),
  ])

  const all = contracts ?? []
  const active = all.filter(c => c.is_active)

  // Total monthly cost (active, EUR-only for simplicity)
  const monthlyTotal = active
    .filter(c => c.currency === 'EUR')
    .reduce((sum, c) => sum + toMonthly(c.amount, c.frequency), 0)

  // Group by type, preserving TYPE_ORDER
  const grouped = new Map<string, Contract[]>()
  for (const t of TYPE_ORDER) grouped.set(t, [])
  for (const c of all) {
    const key = TYPE_ORDER.includes(c.type) ? c.type : 'other'
    grouped.get(key)!.push(c)
  }

  const warningCount = all.filter(c => c.is_active && isNoticeExpired(c)).length

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verträge & Abos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {active.length} aktive Verträge · monatlich ca. {fmtEur(monthlyTotal)}
            {warningCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3" />
                {warningCount} Kündigungswarnung{warningCount > 1 ? 'en' : ''}
              </span>
            )}
          </p>
        </div>
        <AddContractDialog accounts={accounts ?? []} categories={categories ?? []} />
      </div>

      {/* Groups */}
      {all.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([type, items]) =>
            items.length === 0 ? null : (
              <ContractGroup
                key={type}
                title={TYPE_LABEL[type] ?? type}
                contracts={items}
                accounts={accounts ?? []}
                categories={categories ?? []}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group ────────────────────────────────────────────────────────────────────
function ContractGroup({
  title, contracts, accounts, categories,
}: {
  title: string
  contracts: Contract[]
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {title}
        <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/70">
          ({contracts.length})
        </span>
      </h2>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {contracts.map(c => (
              <ContractRow
                key={c.id} contract={c}
                accounts={accounts} categories={categories}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function ContractRow({
  contract: c, accounts, categories,
}: {
  contract: Contract & { to_account_id?: string | null }
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}) {
  const expired     = isNoticeExpired(c)
  const nextDate    = c.is_active ? nextBillingDate(c.start_date, c.frequency) : null
  const isTransfer  = TRANSFER_TYPES.has(c.type)
  const fromAccount = isTransfer ? accounts.find(a => a.id === c.account_id) : null
  const toAccount   = isTransfer ? accounts.find(a => a.id === c.to_account_id) : null

  return (
    <tr className={`hover:bg-muted/30 transition-colors group ${!c.is_active ? 'opacity-50' : ''}`}>
      {/* Name + provider / transfer info */}
      <td className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{c.name}</span>
          {!isTransfer && c.provider && (
            <span className="text-xs text-muted-foreground">{c.provider}</span>
          )}
          {isTransfer && (fromAccount || toAccount) && (
            <span className="text-xs text-muted-foreground">
              {fromAccount?.name ?? '—'} → {toAccount?.name ?? '—'}
            </span>
          )}

          {/* Badges */}
          {!c.is_active && (
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Inaktiv
            </span>
          )}
          {c.is_active && expired && (
            <span className="inline-flex items-center gap-1 text-xs rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              <AlertTriangle className="size-3" />
              Kündigung überfällig
            </span>
          )}
          {c.is_active && c.auto_renews && !expired && (
            <span className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
              <RefreshCw className="size-2.5" />
            </span>
          )}
        </div>
        {nextDate && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Nächste Zahlung: {fmtDate(nextDate)}
          </p>
        )}
      </td>

      {/* Betrag + Intervall */}
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
        <span className="font-medium">{fmtCurrency(c.amount, c.currency)}</span>
        <span className="text-muted-foreground text-xs ml-1">/ {FREQ_LABEL[c.frequency] ?? c.frequency}</span>
      </td>

      {/* Enddatum / Kündigungsfrist */}
      <td className="px-4 py-3 whitespace-nowrap">
        {c.end_date ? (
          <span className={`text-xs ${expired && c.is_active ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            Bis {fmtDate(new Date(c.end_date))}
            {c.notice_days > 0 && ` · ${c.notice_days}d Frist`}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unbefristet</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditContractDialog contract={c} accounts={accounts} categories={categories} />
          <DeleteContractButton contract={c} />
        </div>
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Keine Verträge erfasst</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Lege Abonnements, Versicherungen oder andere Verträge an.
      </p>
    </div>
  )
}
