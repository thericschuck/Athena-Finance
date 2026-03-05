import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { AddDebtDialog, DebtPaymentDialog, EditDebtDialog, DeleteDebtButton } from '@/components/finance/debt-payment-form'
import { CalendarDays, TrendingDown, TrendingUp } from 'lucide-react'

type Debt = Database['public']['Tables']['debts']['Row']

interface PageProps {
  searchParams: Promise<{ all?: string }>
}

const fmt = (amount: number, currency: string) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(dateStr)
  )
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

export default async function DebtsPage({ searchParams }: PageProps) {
  const { all } = await searchParams
  const showAll = all === '1'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let query = supabase
    .from('debts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  if (!showAll) query = query.eq('is_active', true)

  const { data: debts } = await query
  const all_debts = debts ?? []

  const borrowed = all_debts.filter((d) => d.type === 'borrowed')
  const lent = all_debts.filter((d) => d.type === 'lent')

  const totalOwed = borrowed.reduce((s, d) => s + d.outstanding, 0)
  const totalLent = lent.reduce((s, d) => s + d.outstanding, 0)

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schulden</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {showAll ? 'Alle Einträge' : 'Aktive Einträge'} ·{' '}
            <a
              href={showAll ? '/finance/debts' : '/finance/debts?all=1'}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {showAll ? 'Nur aktive zeigen' : 'Abgeschlossene anzeigen'}
            </a>
          </p>
        </div>
        <AddDebtDialog />
      </div>

      {/* Summary cards */}
      {all_debts.length > 0 && (
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <SummaryCard
            label="Ich schulde"
            amount={totalOwed}
            currency="EUR"
            color="red"
            icon={<TrendingDown className="size-4" />}
          />
          <SummaryCard
            label="Mir wird geschuldet"
            amount={totalLent}
            currency="EUR"
            color="green"
            icon={<TrendingUp className="size-4" />}
          />
        </div>
      )}

      {/* Sections */}
      {all_debts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {borrowed.length > 0 && (
            <DebtSection title="Ich schulde" debts={borrowed} accentColor="red" />
          )}
          {lent.length > 0 && (
            <DebtSection title="Mir wird geschuldet" debts={lent} accentColor="green" />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Summary card
// ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  amount,
  currency,
  color,
  icon,
}: {
  label: string
  amount: number
  currency: string
  color: 'red' | 'green'
  icon: React.ReactNode
}) {
  const bg = color === 'red' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'
  const text = color === 'red' ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'

  return (
    <div className={`rounded-lg border border-border px-4 py-3 ${bg}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${text}`}>
        {icon}
        {label}
      </div>
      <p className={`text-xl font-semibold tabular-nums ${text}`}>
        {fmt(amount, currency)}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section (borrowed / lent)
// ─────────────────────────────────────────────────────────────
function DebtSection({
  title,
  debts,
  accentColor,
}: {
  title: string
  debts: Debt[]
  accentColor: 'red' | 'green'
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {debts.map((debt) => (
          <DebtCard key={debt.id} debt={debt} accentColor={accentColor} />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Debt card
// ─────────────────────────────────────────────────────────────
function DebtCard({ debt, accentColor }: { debt: Debt; accentColor: 'red' | 'green' }) {
  const paid = debt.original_amount - debt.outstanding
  const progress =
    debt.original_amount > 0
      ? Math.min(100, Math.round((paid / debt.original_amount) * 100))
      : 0
  const overdue = isOverdue(debt.due_date)

  const barColor = !debt.is_active
    ? 'bg-muted-foreground/40'
    : accentColor === 'red'
    ? 'bg-red-500 dark:bg-red-400'
    : 'bg-green-500 dark:bg-green-400'

  const badgeClasses =
    accentColor === 'red'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground truncate">{debt.name}</p>
            {!debt.is_active && (
              <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Abgeschlossen
              </span>
            )}
          </div>
          {debt.creditor && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{debt.creditor}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${badgeClasses}`}>
          {debt.type === 'borrowed' ? 'Geliehen' : 'Verliehen'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress}% bezahlt</span>
          <span>{fmt(paid, debt.currency)} / {fmt(debt.original_amount, debt.currency)}</span>
        </div>
      </div>

      {/* Outstanding amount */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Ausstehend</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {fmt(debt.outstanding, debt.currency)}
          </p>
        </div>
        {debt.monthly_payment && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Rate/Monat</p>
            <p className="text-sm font-medium tabular-nums">{fmt(debt.monthly_payment, debt.currency)}</p>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-2 flex-wrap">
          {debt.interest_rate != null && (
            <span>{debt.interest_rate}% p.a.</span>
          )}
          {debt.due_date && (
            <span
              className={`flex items-center gap-1 ${overdue && debt.is_active ? 'text-destructive font-medium' : ''}`}
            >
              <CalendarDays className="size-3" />
              {formatDate(debt.due_date)}
              {overdue && debt.is_active && ' · überfällig'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {debt.is_active && <DebtPaymentDialog debt={debt} />}
          <EditDebtDialog debt={debt} />
          <DeleteDebtButton debt={debt} />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Keine Schulden erfasst</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Lege geliehene oder verliehene Beträge an, um den Überblick zu behalten.
      </p>
    </div>
  )
}
