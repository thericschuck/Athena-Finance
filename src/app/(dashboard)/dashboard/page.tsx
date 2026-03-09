import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertCircle, Clock, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { CryptoWidget } from '@/components/dashboard/crypto-widget'
import { RebalancingAlert } from '@/components/dashboard/rebalancing-alert'
import { FixedCostsWidget } from '@/components/finance/fixed-costs-widget'
import { NetWorthChart } from '@/components/dashboard/net-worth-chart'
import { getStrategySignals, getPortfolioAllocations, getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import { getDepotsSummaries } from '@/app/actions/depot'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDateShort } from '@/lib/format'

function daysUntil(d: Date): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Contract renewal helpers ─────────────────────────────────────────────────
type ContractRow = {
  id: string; name: string; provider: string | null; frequency: string
  amount: number; currency: string; end_date: string | null
  notice_days: number; auto_renews: boolean; account_id: string | null
}

function toMonthly(amount: number, frequency: string): number {
  const map: Record<string, number> = {
    weekly: 52 / 12, biweekly: 26 / 12,
    monthly: 1, quarterly: 1 / 3, biannual: 1 / 6, yearly: 1 / 12,
  }
  return amount * (map[frequency] ?? 1)
}
function addFrequency(d: Date, f: string) {
  if (f === 'weekly')    d.setDate(d.getDate() + 7)
  else if (f === 'biweekly')  d.setDate(d.getDate() + 14)
  else if (f === 'monthly')   d.setMonth(d.getMonth() + 1)
  else if (f === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (f === 'biannual')  d.setMonth(d.getMonth() + 6)
  else if (f === 'yearly')    d.setFullYear(d.getFullYear() + 1)
}
function getNextRenewal(c: ContractRow): Date | null {
  if (!c.end_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(c.end_date)
  if (d >= today) return d
  if (!c.auto_renews) return null
  let i = 0
  while (d < today && i++ < 200) addFrequency(d, c.frequency)
  return d >= today ? d : null
}

// ─── Shared card ──────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card ${className}`}>{children}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const settings    = await getSettings(user!.id)
  const locale      = (settings.number_format as string) ?? 'de-DE'
  const dateFormat  = (settings.date_format   as string) ?? 'dd.MM.yyyy'

  const fmt     = (n: number, currency = 'EUR') => fmtCurrency(n, currency, locale)
  const fmtDate = (d: string | Date | null)      => fmtDateShort(d, dateFormat)

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // ── Parallel data fetching ────────────────────────────────────────────────
  const [
    { data: accountsRaw },
    { data: txAll },
    { data: txMonth },
    { data: debtsRaw },
    { data: goalsRaw },
    { data: cryptoAssetsRaw },
    { data: contractsRaw },
    cryptoSignals,
    cryptoAllocations,
    lastRebalancing,
    depotSummaries,
  ] = await Promise.all([
    supabase.from('accounts').select('id, name, type, color, currency, is_active').eq('user_id', user!.id).order('sort_order'),
    supabase.from('transactions').select('account_id, type, amount, currency').eq('user_id', user!.id),
    supabase.from('transactions').select('type, amount').eq('user_id', user!.id).gte('date', monthStart),
    supabase.from('debts').select('outstanding, type').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('savings_goals').select('*').eq('user_id', user!.id).eq('status', 'offen'),
    supabase.from('assets').select('id, symbol, name, portfolio_name, quantity, avg_buy_price').in('type', ['crypto', 'stable', 'fiat']).eq('user_id', user!.id),
    supabase.from('contracts').select('id,name,provider,frequency,amount,currency,end_date,notice_days,auto_renews,account_id').eq('user_id', user!.id).eq('is_active', true),
    getStrategySignals(user!.id),
    getPortfolioAllocations(user!.id),
    getLastRebalancing(user!.id),
    getDepotsSummaries(),
  ])

  // Net worth snapshots for chart (last 2 years)
  const snapshotFrom = new Date()
  snapshotFrom.setFullYear(snapshotFrom.getFullYear() - 2)
  const { data: netWorthSnapshots } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date,net_worth,total_checking,total_savings,total_cash,total_depot,total_crypto,total_bausparer,total_business,total_debts,total_assets')
    .eq('user_id', user!.id)
    .gte('snapshot_date', snapshotFrom.toISOString().split('T')[0])
    .order('snapshot_date')

  type GoalDash = { current_amount: number; target_amount: number; description: string; status: string }

  const accounts       = accountsRaw ?? []
  const activeAccounts = accounts.filter(a => a.is_active)
  const contracts = (contractsRaw ?? []) as ContractRow[]
  const debts     = debtsRaw ?? []
  const goals     = (goalsRaw ?? []) as unknown as GoalDash[]

  // ── Account balances from transactions ────────────────────────────────────
  const balMap = new Map<string, number>()
  for (const tx of (txAll ?? [])) {
    const cur = balMap.get(tx.account_id) ?? 0
    if (tx.type === 'income')   balMap.set(tx.account_id, cur + tx.amount)
    if (tx.type === 'expense')  balMap.set(tx.account_id, cur - tx.amount)
    // transfers / investments: neutral for simple balance sum
  }

  // ── Monthly income / expenses ─────────────────────────────────────────────
  let monthIncome = 0, monthExpense = 0
  for (const tx of (txMonth ?? [])) {
    if (tx.type === 'income')  monthIncome  += tx.amount
    if (tx.type === 'expense') monthExpense += tx.amount
  }
  const monthNet = monthIncome - monthExpense

  // ── Crypto portfolio ──────────────────────────────────────────────────────
  const cryptoAssetIds = (cryptoAssetsRaw ?? []).map(a => a.id)
  let cryptoValMap = new Map<string, { price_per_unit: number; total_value: number }>()
  if (cryptoAssetIds.length > 0) {
    const { data: vals } = await supabase
      .from('asset_valuations')
      .select('asset_id, price_per_unit, total_value')
      .in('asset_id', cryptoAssetIds)
      .order('valuation_date', { ascending: false })
      .order('created_at', { ascending: false })
    for (const v of vals ?? []) {
      if (!cryptoValMap.has(v.asset_id)) cryptoValMap.set(v.asset_id, v)
    }
  }
  const cryptoAssets = (cryptoAssetsRaw ?? []).map(a => ({
    ...a,
    current_price: cryptoValMap.get(a.id)?.price_per_unit ?? null,
    current_value: cryptoValMap.get(a.id)?.total_value ?? null,
  }))
  const cryptoTotal     = cryptoAssets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const cryptoTotalCost = cryptoAssets.reduce((s, a) =>
    a.avg_buy_price != null && a.quantity != null ? s + a.avg_buy_price * a.quantity : s, 0)

  // ── Net Worth ─────────────────────────────────────────────────────────────
  const financeTotal  = accounts.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0)
  // borrowed = I owe → reduces net worth; lent = others owe me → increases net worth
  const borrowedTotal = (debtsRaw ?? []).filter(d => d.type === 'borrowed').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const lentTotal     = (debtsRaw ?? []).filter(d => d.type === 'lent').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const savingsTotal  = goals.reduce((s, g) => s + (g.current_amount ?? 0), 0)
  const depotTotal    = depotSummaries.reduce((s, d) => s + (d.depotValue ?? 0), 0)
  const netWorth      = financeTotal + cryptoTotal + savingsTotal + lentTotal + depotTotal - borrowedTotal

  // ── Rebalancing ───────────────────────────────────────────────────────────
  const rebResult        = calculateRebalancing(cryptoSignals, cryptoAllocations, cryptoAssets, cryptoTotal)
  const rebalancingVolume = rebResult.rebalancing_volume
  const topAssets = [...cryptoAssets]
    .filter(a => (a.current_value ?? 0) > 0)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, 4)
    .map(a => {
      const rebRow = rebResult.rows.find(r => r.coingecko_id === a.symbol)
      return { symbol: rebRow?.symbol ?? (a.name ?? a.symbol ?? '?'), value: a.current_value ?? 0, pct: cryptoTotal > 0 ? ((a.current_value ?? 0) / cryptoTotal) * 100 : 0 }
    })

  // ── Fixed costs widget data ───────────────────────────────────────────────
  const contractsForWidget = contracts
    .filter(c => c.currency === 'EUR')
    .map(c => ({ id: c.id, name: c.name, monthly: toMonthly(c.amount, c.frequency), accountId: c.account_id }))
    .sort((a, b) => b.monthly - a.monthly)

  const fixedCostsTotal = contractsForWidget.reduce((s, c) => s + c.monthly, 0)

  // ── Contract renewals ─────────────────────────────────────────────────────
  type UpcomingContract = ContractRow & { renewalDate: Date; deadlineDate: Date; days: number }
  const upcoming: UpcomingContract[] = contracts
    .map(c => {
      const renewalDate = getNextRenewal(c)
      if (!renewalDate) return null
      const deadlineDate = new Date(renewalDate)
      deadlineDate.setDate(deadlineDate.getDate() - c.notice_days)
      return { ...c, renewalDate, deadlineDate, days: daysUntil(deadlineDate) }
    })
    .filter((c): c is UpcomingContract => c !== null && c.days <= 45)
    .sort((a, b) => a.days - b.days)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {now.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Row 1: Net Worth + Monat + Crypto ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Net Worth */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Net Worth</p>
          <p className={`text-4xl font-bold tabular-nums tracking-tight ${netWorth < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {fmt(netWorth)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {([
              ['Finanzen',        financeTotal,   'neutral'],
              ['Depot',           depotTotal,     'neutral'],
              ['Krypto',          cryptoTotal,    'neutral'],
              ['Sparziele',       savingsTotal,   'neutral'],
              ['Ich schulde',     borrowedTotal,  'red'],
              ['Mir geschuldet',  lentTotal,      lentTotal > 0 ? 'green' : 'neutral'],
            ] as [string, number, 'neutral' | 'red' | 'green'][]).filter(([, val]) => val > 0).map(([label, val, color]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-semibold tabular-nums ${
                  color === 'red'   ? 'text-red-600 dark:text-red-400' :
                  color === 'green' ? 'text-green-600 dark:text-green-400' : ''
                }`}>
                  {color === 'red' ? '−' : ''}{fmt(val)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Monatsbilanz */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {now.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
          </p>
          {monthIncome === 0 && monthExpense === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Transaktionen diesen Monat.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <p className={`text-4xl font-bold tabular-nums tracking-tight ${monthNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {monthNet >= 0 ? '+' : ''}{fmt(monthNet)}
                </p>
                {monthNet >= 0
                  ? <TrendingUp  className="size-5 text-green-500" />
                  : <TrendingDown className="size-5 text-red-500"  />
                }
              </div>
              <div className="flex gap-5">
                <div className="flex items-start gap-1.5">
                  <ArrowUpRight className="size-4 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Einnahmen</p>
                    <p className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">{fmt(monthIncome)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <ArrowDownRight className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Ausgaben</p>
                    <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{fmt(monthExpense)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Crypto */}
        <CryptoWidget
          totalValue={cryptoTotal}
          totalCost={cryptoTotalCost > 0 ? cryptoTotalCost : null}
          rebalancingVolume={rebalancingVolume}
          lastRebalancing={lastRebalancing}
          topAssets={topAssets}
          locale={locale}
        />
      </div>

      {/* ── Net Worth Chart ───────────────────────────────────────────────────── */}
      <NetWorthChart snapshots={netWorthSnapshots ?? []} />

      {/* ── Depots ────────────────────────────────────────────────────────────── */}
      {depotSummaries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Depots
              <span className="ml-2 text-xs font-normal text-muted-foreground">{depotSummaries.length}</span>
            </h2>
            <Link href="/depot" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Zum Depot →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {depotSummaries.map(d => {
              const hasValue = d.depotValue !== null && d.depotValue > 0
              return (
                <Link key={d.id} href="/depot">
                  <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <p className="text-xs text-muted-foreground font-medium truncate">{d.name}</p>
                      <span className="text-xs text-muted-foreground font-mono ml-auto shrink-0">{d.isin}</span>
                    </div>
                    <p className="text-xl font-bold tabular-nums leading-tight">
                      {hasValue ? fmtCurrency(d.depotValue!, 'EUR', locale) : '—'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {d.totalShares > 0 ? `${d.totalShares.toFixed(4)} Anteile` : 'Keine Anteile'}
                      </p>
                      {d.returnPct !== null && (
                        <p className={`text-xs font-medium tabular-nums ${d.returnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {d.returnPct >= 0 ? '+' : ''}{d.returnPct.toFixed(2)} %
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Rebalancing alert ──────────────────────────────────────────────────── */}
      <RebalancingAlert rebalancingVolume={rebalancingVolume} lastRebalancing={lastRebalancing} locale={locale} dateFormat={dateFormat} />

      {/* ── Konten ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            Konten
            <span className="ml-2 text-xs font-normal text-muted-foreground">{activeAccounts.length} aktiv</span>
          </h2>
          <Link href="/finance/accounts" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Alle ansehen →
          </Link>
        </div>

        {activeAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">Keine aktiven Konten.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {activeAccounts.map(a => {
              const bal = balMap.get(a.id) ?? 0
              const neg = bal < 0
              const hasTransactions = txAll?.some(t => t.account_id === a.id) ?? false
              return (
                <Link key={a.id} href={`/finance/accounts/${a.id}`}>
                  <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      {a.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />}
                      <p className="text-xs text-muted-foreground font-medium truncate">{a.name}</p>
                    </div>
                    <p className={`text-xl font-bold tabular-nums leading-tight ${neg ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {hasTransactions
                        ? fmtCurrency(bal, a.currency, locale)
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{a.type}</p>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sparziele + Vertragsfristen + Fixkosten ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Sparziele */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Sparziele
              {goals.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{goals.length} aktiv</span>}
            </h2>
            <Link href="/finance/goals" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Alle ansehen →
            </Link>
          </div>
          {goals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground">Keine aktiven Sparziele</p>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.slice(0, 5).map((g, i) => {
                const current = g.current_amount ?? 0
                const missing = Math.max(0, g.target_amount - current)
                const pct = Math.min(100, Math.round((current / g.target_amount) * 100))
                const done = pct >= 100
                return (
                  <Card key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-sm font-medium truncate">{g.description}</p>
                      {done ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">Erreicht ✓</span>
                      ) : (
                        <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
                          noch <span className="text-foreground font-medium">{fmt(missing)}</span>
                        </p>
                      )}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{fmt(current)} gespart</span>
                      <span>{pct}% von {fmt(g.target_amount)}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Fixkosten */}
        <FixedCostsWidget
          totalMonthly={fixedCostsTotal}
          contracts={contractsForWidget}
          accounts={accounts.map(a => ({ id: a.id, name: a.name }))}
        />

        {/* Vertragsfristen */}
        <div>
          <h2 className="text-sm font-semibold mb-3">
            Kündbarkeit in Kürze
            {upcoming.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{upcoming.length}</span>}
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
                      overdue || urgent ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                      : warning        ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
                      : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {overdue || urgent ? <AlertCircle className="size-4 text-red-500 shrink-0" />
                        : warning        ? <Clock       className="size-4 text-amber-500 shrink-0" />
                        :                  <Minus       className="size-4 text-muted-foreground/40 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.provider ? `${c.provider} · ` : ''}{fmt(c.amount, c.currency)}/{c.frequency}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        overdue || urgent ? 'text-red-600 dark:text-red-400'
                        : warning        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                      }`}>
                        {overdue ? `${Math.abs(c.days)}d überfällig` : `${c.days}d`}
                      </p>
                      <p className="text-xs text-muted-foreground">bis {fmtDate(c.deadlineDate)}</p>
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
