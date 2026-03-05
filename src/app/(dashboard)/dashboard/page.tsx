import { createClient } from '@/lib/supabase/server'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, AlertCircle, Clock, Minus } from 'lucide-react'
import { NetWorthChart } from '@/components/dashboard/net-worth-chart'
import type { NetWorthSnapshot } from '@/components/dashboard/net-worth-chart'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtCurrency(n: number | null | undefined, currency = 'EUR'): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysUntil(d: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Contract renewal helpers ─────────────────────────────────────────────────
type ContractRow = {
  id: string
  name: string
  provider: string | null
  frequency: string
  amount: number
  currency: string
  end_date: string | null
  notice_days: number
  auto_renews: boolean
}

function addFrequency(d: Date, frequency: string): void {
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7);         break
    case 'biweekly':  d.setDate(d.getDate() + 14);        break
    case 'monthly':   d.setMonth(d.getMonth() + 1);       break
    case 'quarterly': d.setMonth(d.getMonth() + 3);       break
    case 'biannual':  d.setMonth(d.getMonth() + 6);       break
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
  }
}

function getNextRenewalDate(c: ContractRow): Date | null {
  if (!c.end_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const renewal = new Date(c.end_date)
  if (renewal >= today) return renewal
  if (!c.auto_renews) return null
  let i = 0
  while (renewal < today && i++ < 200) addFrequency(renewal, c.frequency)
  return renewal >= today ? renewal : null
}

// ─── Shared card wrapper ──────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card card-hover ${className}`}>{children}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const nextYearMonth = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`

  // ── Parallel data fetching ──────────────────────────────────────────────────
  const [
    { data: netWorth },
    { data: accountsRaw },
    { data: allBalances },
    { data: positions },
    { data: contractsRaw },
    { data: monthRows },
    { data: snapshotsRaw },
  ] = await Promise.all([
    supabase.from('current_net_worth').select('*').eq('user_id', user!.id).maybeSingle(),
    supabase.from('accounts').select('*').eq('user_id', user!.id).eq('is_active', true).order('sort_order'),
    supabase.from('account_balances').select('account_id, balance, currency, snapshot_date').order('snapshot_date', { ascending: false }),
    supabase.from('open_positions').select('id,symbol,pair_id,direction,leverage,entry_price,strategy_name,opened_at').eq('user_id', user!.id).eq('status', 'open').order('opened_at', { ascending: false }).limit(10),
    supabase.from('contracts').select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('monthly_finance_summary').select('*').eq('user_id', user!.id).gte('month', yearMonth).lt('month', nextYearMonth).order('created_at', { ascending: false }).limit(1),
    supabase.from('net_worth_snapshots').select('snapshot_date,net_worth,total_checking,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets').eq('user_id', user!.id).order('snapshot_date', { ascending: true }),
  ])

  const accounts  = accountsRaw ?? []
  const contracts = (contractsRaw ?? []) as ContractRow[]
  const month     = (monthRows ?? [])[0] ?? null
  const snapshots = (snapshotsRaw ?? []) as NetWorthSnapshot[]

  // Latest balance per account (balances are already sorted desc by snapshot_date)
  const latestBal = new Map<string, { balance: number; currency: string }>()
  for (const b of (allBalances ?? [])) {
    if (!latestBal.has(b.account_id))
      latestBal.set(b.account_id, { balance: b.balance, currency: b.currency })
  }

  // Upcoming cancellation deadlines (within 45 days)
  type UpcomingContract = ContractRow & { renewalDate: Date; deadlineDate: Date; days: number }
  const upcoming: UpcomingContract[] = contracts
    .map(c => {
      const renewalDate = getNextRenewalDate(c)
      if (!renewalDate) return null
      const deadlineDate = new Date(renewalDate)
      deadlineDate.setDate(deadlineDate.getDate() - c.notice_days)
      return { ...c, renewalDate, deadlineDate, days: daysUntil(deadlineDate) }
    })
    .filter((c): c is UpcomingContract => c !== null && c.days <= 45)
    .sort((a, b) => a.days - b.days)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8 max-w-6xl">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Net Worth Chart ───────────────────────────────────────────────────── */}
      <NetWorthChart snapshots={snapshots} />

      {/* ── Row 1: Net Worth + Monthly Balance ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* Net Worth Widget */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Net Worth</p>
          <p className="text-4xl font-bold tabular-nums tracking-tight">
            {fmtCurrency(netWorth?.net_worth)}
          </p>
          {netWorth?.snapshot_date && (
            <p className="text-xs text-muted-foreground mt-1">Stand {fmtDate(netWorth.snapshot_date)}</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {([
              ['Assets',   netWorth?.total_assets, false],
              ['Crypto',   netWorth?.total_crypto,  false],
              ['Depot',    netWorth?.total_depot,   false],
              ['Schulden', netWorth?.total_debts,   true],
            ] as [string, number | null | undefined, boolean][]).map(([label, val, red]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-semibold tabular-nums ${red ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {fmtCurrency(val)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Monthly Balance Widget */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </p>

          {month ? (
            <>
              {/* Net balance */}
              <div className="flex items-center gap-2 mb-4">
                <p className={`text-4xl font-bold tabular-nums tracking-tight ${month.net_balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmtCurrency(month.net_balance)}
                </p>
                {month.net_balance >= 0
                  ? <TrendingUp  className="size-5 text-green-500" />
                  : <TrendingDown className="size-5 text-red-500"  />
                }
              </div>

              {/* Income vs Expenses */}
              <div className="flex gap-5 mb-4">
                <div className="flex items-start gap-1.5">
                  <ArrowUpRight className="size-4 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Einnahmen</p>
                    <p className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                      {fmtCurrency(month.total_income)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <ArrowDownRight className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Ausgaben</p>
                    <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {fmtCurrency(month.total_expenses)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs border-t border-border pt-3">
                {([
                  ['Gehalt',       month.salary],
                  ['Lebensmittel', month.food],
                  ['Freizeit',     month.leisure],
                  ['Abos',         month.subscriptions],
                  ['Sparen',       month.savings_transfer],
                  ['Sonstiges',    month.other_expenses],
                ] as [string, number][]).filter(([, v]) => v > 0).map(([label, val]) => (
                  <div key={label}>
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-medium text-foreground tabular-nums">{fmtCurrency(val)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Keine Zusammenfassung für diesen Monat vorhanden.</p>
          )}
        </Card>
      </div>

      {/* ── Row 2: Accounts ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold mb-3">
          Konten
          <span className="ml-2 text-xs font-normal text-muted-foreground">{accounts.length} aktiv</span>
        </h2>

        {accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">Keine aktiven Konten.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {accounts.map(a => {
              const bal = latestBal.get(a.id)
              const neg = (bal?.balance ?? 0) < 0
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    {a.color && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                    )}
                    <p className="text-xs text-muted-foreground font-medium truncate">{a.name}</p>
                  </div>
                  <p className={`text-xl font-bold tabular-nums leading-tight ${neg ? 'text-red-600 dark:text-red-400' : ''}`}>
                    {bal != null
                      ? new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: bal.currency,
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(bal.balance)
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">{a.type}</p>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Row 3: Open Positions + Contract Renewals ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Open Positions */}
        <div>
          <h2 className="text-sm font-semibold mb-3">
            Offene Positionen
            {positions && positions.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{positions.length}</span>
            )}
          </h2>

          {!positions || positions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground">Keine offenen Positionen</p>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground text-xs">
                      <th className="px-3 py-2 text-left font-medium">Symbol</th>
                      <th className="px-3 py-2 text-left font-medium">Richtung</th>
                      <th className="px-3 py-2 text-right font-medium">Entry</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Strategie</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Eröffnet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, i) => (
                      <tr
                        key={p.id}
                        className={`hover:bg-muted/20 transition-colors ${i < positions.length - 1 ? 'border-b border-border' : ''}`}
                      >
                        <td className="px-3 py-2.5 font-semibold">{p.symbol ?? p.pair_id ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium ${p.direction === 'long' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {p.direction?.toUpperCase() ?? '—'}
                          </span>
                          {p.leverage && p.leverage > 1 && (
                            <span className="text-xs text-muted-foreground ml-1">{p.leverage}x</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {p.entry_price?.toLocaleString('de-DE') ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs truncate max-w-[110px] hidden sm:table-cell">
                          {p.strategy_name ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                          {p.opened_at ? new Date(p.opened_at).toLocaleDateString('de-DE') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Upcoming Contract Renewals */}
        <div>
          <h2 className="text-sm font-semibold mb-3">
            Kündbarkeit in Kürze
            {upcoming.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{upcoming.length}</span>
            )}
          </h2>

          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground">Keine Verträge in den nächsten 45 Tagen kündbar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map(c => {
                const overdue = c.days < 0
                const urgent  = c.days >= 0 && c.days <= 7
                const warning = c.days > 7  && c.days <= 14

                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
                      overdue || urgent
                        ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                        : warning
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {overdue || urgent
                        ? <AlertCircle className="size-4 text-red-500 shrink-0"             />
                        : warning
                        ? <Clock       className="size-4 text-amber-500 shrink-0"           />
                        : <Minus       className="size-4 text-muted-foreground/40 shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.provider ? `${c.provider} · ` : ''}
                          {fmtCurrency(c.amount, c.currency)}/{c.frequency}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        overdue || urgent ? 'text-red-600 dark:text-red-400'   :
                        warning           ? 'text-amber-600 dark:text-amber-400' :
                        'text-muted-foreground'
                      }`}>
                        {overdue ? `${Math.abs(c.days)}d überfällig` : `${c.days}d`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        bis {c.deadlineDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
