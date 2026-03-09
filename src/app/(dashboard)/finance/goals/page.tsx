import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { Database } from '@/types/database'
import { AddGoalDialog, EditGoalDialog, DeleteGoalButton, GoalPaymentDialog } from '@/components/finance/goal-form'
import { setGoalStatus } from './actions'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, TrendingDown, TrendingUp } from 'lucide-react'

type GoalRow = Database['public']['Tables']['savings_goals']['Row']
type Goal = GoalRow & { current_amount: number; savings_rate_start_date: string | null }

// ─── Calculations ─────────────────────────────────────────────────────────────
function progressPct(goal: Goal): number {
  if (goal.target_amount <= 0) return 0
  return Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
}

/** Months remaining until goal reached at current rate */
function monthsRemaining(goal: Goal): number | null {
  if (!goal.monthly_savings_rate || goal.monthly_savings_rate <= 0) return null
  const remaining = goal.target_amount - goal.current_amount
  if (remaining <= 0) return 0
  return Math.ceil(remaining / goal.monthly_savings_rate)
}

/**
 * How many complete monthly payments should have been made since savings_rate_start_date.
 * A payment "counts" once you've reached the day-of-month of the start date.
 */
function monthsElapsed(startDate: string): number {
  const start = new Date(startDate)
  const now   = new Date()
  const diff  = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  // Only count the current month if we've passed the day-of-month
  return now.getDate() >= start.getDate() ? diff : Math.max(0, diff - 1)
}

/** Expected saved amount based on savings plan (null if no rate/start date) */
function expectedSaved(goal: Goal): number | null {
  if (!goal.monthly_savings_rate || !goal.savings_rate_start_date) return null
  const months = monthsElapsed(goal.savings_rate_start_date)
  return months * goal.monthly_savings_rate
}

/** Gap: positive = ahead, negative = behind plan */
function savingsGap(goal: Goal): number | null {
  const expected = expectedSaved(goal)
  if (expected === null) return null
  return goal.current_amount - expected
}

function formatDuration(months: number): string {
  if (months === 0) return 'Erreicht'
  if (months < 12) return `${months} Mon.`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem === 0 ? `${years} J.` : `${years} J. ${rem} Mon.`
}

function formatDate(dateStr: string, dateFormat: string) {
  return fmtDate(dateStr, dateFormat)
}

const fmt = (n: number, locale: string) =>
  fmtCurrency(n, 'EUR', locale)

// ─── Sort config ─────────────────────────────────────────────────────────────
const PRIORITY_RANK: Record<string, number> = { hoch: 0, mittel: 1, niedrig: 2 }

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority ?? ''] ?? 3
    const pb = PRIORITY_RANK[b.priority ?? ''] ?? 3
    if (pa !== pb) return pa - pb
    return progressPct(a) - progressPct(b)
  })
}

// ─── Badge configs ────────────────────────────────────────────────────────────
const PRIORITY_BADGE: Record<string, { label: string; classes: string }> = {
  hoch:    { label: 'Hoch',    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  mittel:  { label: 'Mittel',  classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  niedrig: { label: 'Niedrig', classes: 'bg-muted text-muted-foreground' },
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  offen:        <Circle className="size-4 text-green-500" />,
  geschlossen:  <CheckCircle2 className="size-4 text-muted-foreground" />,
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: goals }, settings] = await Promise.all([
    supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  const all = (goals ?? []) as unknown as Goal[]
  const active = sortGoals(all.filter(g => g.status !== 'geschlossen'))
  const closed = all.filter(g => g.status === 'geschlossen')

  const totalTarget  = active.reduce((s, g) => s + g.target_amount, 0)
  const totalMonthly = active.reduce((s, g) => s + (g.monthly_savings_rate ?? 0), 0)

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sparziele</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {active.length} aktive Ziele · Gesamt {fmt(totalTarget, locale)} · {fmt(totalMonthly, locale)}/Monat
          </p>
        </div>
        <AddGoalDialog />
      </div>

      {all.length === 0 && <EmptyState />}

      {/* Active goals */}
      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map(goal => (
            <GoalCard key={goal.id} goal={goal} locale={locale} dateFormat={dateFormat} />
          ))}
        </div>
      )}

      {/* Closed goals */}
      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Abgeschlossen ({closed.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map(goal => (
              <GoalCard key={goal.id} goal={goal} locale={locale} dateFormat={dateFormat} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Goal card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, locale, dateFormat }: { goal: Goal; locale: string; dateFormat: string }) {
  const pct       = progressPct(goal)
  const saved     = goal.current_amount
  const remaining = monthsRemaining(goal)
  const gap       = savingsGap(goal)
  const isClosed  = goal.status === 'geschlossen'

  const priorityBadge = goal.priority ? PRIORITY_BADGE[goal.priority] : null

  const nextStatus   = isClosed ? 'offen' : 'geschlossen'
  const toggleAction = setGoalStatus.bind(null, goal.id, nextStatus)

  const barColor = isClosed
    ? 'bg-muted-foreground/40'
    : pct >= 100
    ? 'bg-green-500 dark:bg-green-400'
    : 'bg-primary'

  return (
    <div className={`rounded-lg border border-border bg-card p-4 flex flex-col gap-3 ${isClosed ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {STATUS_ICON[goal.status] ?? STATUS_ICON['offen']}
          <p className="font-medium text-foreground truncate">{goal.description}</p>
        </div>
        {priorityBadge && (
          <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${priorityBadge.classes}`}>
            {priorityBadge.label}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}%</span>
          <span>{fmt(saved, locale)} / {fmt(goal.target_amount, locale)}</span>
        </div>
      </div>

      {/* Savings plan tracker */}
      {gap !== null && !isClosed && (
        <SavingsPlanBadge gap={gap} locale={locale} />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {goal.monthly_savings_rate && (
          <div>
            <p className="text-muted-foreground">Sparrate</p>
            <p className="font-medium">{fmt(goal.monthly_savings_rate, locale)}/Mo.</p>
          </div>
        )}
        {remaining !== null && remaining > 0 && (
          <div>
            <p className="text-muted-foreground">Noch ca.</p>
            <p className="font-medium">{formatDuration(remaining)}</p>
          </div>
        )}
        {goal.savings_rate_start_date && (
          <div>
            <p className="text-muted-foreground">Sparplan seit</p>
            <p className="font-medium">{formatDate(goal.savings_rate_start_date, dateFormat)}</p>
          </div>
        )}
        {goal.target_date && (
          <div>
            <p className="text-muted-foreground">Zieldatum</p>
            <p className="font-medium">{formatDate(goal.target_date, dateFormat)}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border">
        <form action={toggleAction}>
          <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground">
            {isClosed ? 'Wieder öffnen' : 'Als erreicht markieren'}
          </Button>
        </form>

        <div className="flex items-center gap-1">
          <GoalPaymentDialog goal={goal} />
          <EditGoalDialog goal={goal} />
          <DeleteGoalButton goal={goal} />
        </div>
      </div>
    </div>
  )
}

// ─── Savings plan indicator ───────────────────────────────────────────────────
function SavingsPlanBadge({ gap, locale }: { gap: number; locale: string }) {
  const fmt = (n: number) =>
    fmtCurrency(Math.abs(n), 'EUR', locale)

  // Small buffer: ±5 € counts as "on track"
  if (gap >= -5) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2.5 py-1.5 text-xs text-green-700 dark:text-green-400">
        <TrendingUp className="size-3.5 shrink-0" />
        <span>
          {gap >= 5
            ? <><strong>{fmt(gap)}</strong> voraus</>
            : 'Sparplan eingehalten'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
      <TrendingDown className="size-3.5 shrink-0" />
      <span><strong>{fmt(gap)}</strong> im Rückstand</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Sparziele</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Definiere dein erstes Sparziel und verfolge deinen Fortschritt.
      </p>
    </div>
  )
}
