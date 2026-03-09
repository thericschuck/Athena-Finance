import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import {
  AddContractDialog,
  EditContractDialog,
  DeleteContractButton,
} from '@/components/finance/contract-form'
import { CONTRACT_TYPES, FREQUENCIES, TRANSFER_TYPES } from '@/lib/finance/contract-constants'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { getSettings } from '@/lib/settings'
import { fmtCurrency as fmtCurrencyLib, fmtDate as fmtDateLib } from '@/lib/format'

type Contract = Database['public']['Tables']['contracts']['Row'] & { to_account_id?: string | null }

// ─── Date utilities ───────────────────────────────────────────────────────────
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
    const next = new Date(start)
    next.setDate(next.getDate() + (Math.floor(diff / days) + 1) * days)
    return next
  }

  const months = intervalMonths[frequency] ?? 1
  const monthsDiff =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth())
  const next = new Date(start)
  next.setMonth(next.getMonth() + Math.max(0, Math.floor(monthsDiff / months)) * months)
  while (next <= today) next.setMonth(next.getMonth() + months)
  return next
}

function isNoticeExpired(contract: Contract): boolean {
  if (!contract.end_date || contract.notice_days == null) return false
  const deadline = new Date(contract.end_date)
  deadline.setDate(deadline.getDate() - contract.notice_days)
  deadline.setHours(0, 0, 0, 0)
  return deadline <= new Date()
}

function toMonthly(amount: number, frequency: string): number {
  const map: Record<string, number> = {
    weekly: 52 / 12, biweekly: 26 / 12,
    monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
  }
  return amount * (map[frequency] ?? 1)
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number, locale: string) =>
  fmtCurrencyLib(n, 'EUR', locale)

function fmtCurrency(n: number, currency: string, locale: string) {
  return fmtCurrencyLib(n, currency, locale)
}

function fmtDate(d: Date, dateFormat: string) {
  return fmtDateLib(d, dateFormat)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_ORDER = [
  'subscription', 'insurance', 'utility', 'loan', 'rental',
  'transfer', 'savings_plan', 'building_savings', 'service', 'other',
]
const TYPE_LABEL = Object.fromEntries(CONTRACT_TYPES.map(t => [t.value, t.label]))
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: contracts }, { data: accounts }, { data: categories }, settings] = await Promise.all([
    supabase.from('contracts').select('*').eq('user_id', user!.id).order('name'),
    supabase.from('accounts').select('id, name').eq('user_id', user!.id).order('sort_order'),
    supabase.from('categories').select('id, name').eq('user_id', user!.id).order('name'),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  const all    = (contracts ?? []) as Contract[]
  const active = all.filter(c => c.is_active)
  const accs   = accounts ?? []

  const monthlyTotal = active
    .filter(c => c.currency === 'EUR')
    .reduce((s, c) => s + toMonthly(c.amount, c.frequency), 0)

  // Per-account monthly breakdown
  const byAccount = new Map<string, { name: string; monthly: number }>()
  for (const c of active.filter(c => c.currency === 'EUR' && c.account_id)) {
    const acc = accs.find(a => a.id === c.account_id)
    const key = c.account_id!
    if (!byAccount.has(key)) byAccount.set(key, { name: acc?.name ?? 'Unbekannt', monthly: 0 })
    byAccount.get(key)!.monthly += toMonthly(c.amount, c.frequency)
  }
  const accountBreakdown = Array.from(byAccount.values()).sort((a, b) => b.monthly - a.monthly)

  const grouped = new Map<string, Contract[]>()
  for (const t of TYPE_ORDER) grouped.set(t, [])
  for (const c of all) grouped.get(TYPE_ORDER.includes(c.type) ? c.type : 'other')!.push(c)

  const warningCount = all.filter(c => c.is_active && isNoticeExpired(c)).length

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verträge & Abos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {active.length} aktive Verträge · monatlich ca. {fmtEur(monthlyTotal, locale)}
            {warningCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3" />
                {warningCount} Kündigungswarnung{warningCount > 1 ? 'en' : ''}
              </span>
            )}
          </p>
        </div>
        <AddContractDialog accounts={accs} categories={categories ?? []} />
      </div>

      {/* Per-account breakdown */}
      {accountBreakdown.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Fixkosten nach Konto</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {accountBreakdown.map(({ name, monthly }) => (
              <div key={name} className="space-y-0.5">
                <p className="text-xs text-muted-foreground truncate">{name}</p>
                <p className="text-base font-semibold tabular-nums">
                  {fmtEur(monthly, locale)}
                  <span className="text-xs font-normal text-muted-foreground">/Mo.</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
                accounts={accs}
                categories={categories ?? []}
                locale={locale}
                dateFormat={dateFormat}
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
  title, contracts, accounts, categories, locale, dateFormat,
}: {
  title: string
  contracts: Contract[]
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  locale: string
  dateFormat: string
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
              <ContractRow key={c.id} contract={c} accounts={accounts} categories={categories} locale={locale} dateFormat={dateFormat} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function ContractRow({
  contract: c, accounts, categories, locale, dateFormat,
}: {
  contract: Contract
  accounts: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  locale: string
  dateFormat: string
}) {
  const expired    = isNoticeExpired(c)
  const nextDate   = c.is_active ? nextBillingDate(c.start_date, c.frequency) : null
  const isTransfer = TRANSFER_TYPES.has(c.type)
  const fromAcc    = isTransfer ? accounts.find(a => a.id === c.account_id) : null
  const toAcc      = isTransfer ? accounts.find(a => a.id === c.to_account_id) : null

  return (
    <tr className={`hover:bg-muted/30 transition-colors group ${!c.is_active ? 'opacity-50' : ''}`}>
      {/* Name */}
      <td className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/finance/contracts/${c.id}`}
            className="font-medium text-foreground hover:underline underline-offset-2"
          >
            {c.name}
          </Link>
          {!isTransfer && c.provider && (
            <span className="text-xs text-muted-foreground">{c.provider}</span>
          )}
          {isTransfer && (fromAcc || toAcc) && (
            <span className="text-xs text-muted-foreground">
              {fromAcc?.name ?? '—'} → {toAcc?.name ?? '—'}
            </span>
          )}
          {!c.is_active && (
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Inaktiv</span>
          )}
          {c.is_active && expired && (
            <span className="inline-flex items-center gap-1 text-xs rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              <AlertTriangle className="size-3" />Kündigung überfällig
            </span>
          )}
          {c.is_active && c.auto_renews && !expired && (
            <span className="text-muted-foreground/60 flex items-center gap-0.5 text-xs">
              <RefreshCw className="size-2.5" />
            </span>
          )}
        </div>
        {nextDate && (
          <p className="text-xs text-muted-foreground mt-0.5">Nächste Zahlung: {fmtDate(nextDate, dateFormat)}</p>
        )}
      </td>

      {/* Betrag */}
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
        <span className="font-medium">{fmtCurrency(c.amount, c.currency, locale)}</span>
        <span className="text-muted-foreground text-xs ml-1">/ {FREQ_LABEL[c.frequency] ?? c.frequency}</span>
      </td>

      {/* Enddatum */}
      <td className="px-4 py-3 whitespace-nowrap">
        {c.end_date ? (
          <span className={`text-xs ${expired && c.is_active ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            Bis {fmtDate(new Date(c.end_date), dateFormat)}
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
