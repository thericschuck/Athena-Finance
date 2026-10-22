import { requireAuthUser } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertCircle, Clock, Minus, ArrowUpRight, ArrowDownRight, Gem } from 'lucide-react'
import { CryptoWidget } from '@/components/dashboard/crypto-widget'
import { RebalancingAlert } from '@/components/dashboard/rebalancing-alert'
import { FixedCostsWidget } from '@/components/finance/fixed-costs-widget'
import { NetWorthChart } from '@/components/dashboard/net-worth-chart'
import { PortfolioDonut } from '@/components/dashboard/portfolio-donut'
import { FinanceAnalytics } from '@/components/dashboard/finance-analytics'
import { AthenaInsights } from '@/components/dashboard/athena-insights'
import { getRebalancingTargets, getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import { getDepotsSummaries } from '@/app/actions/depot'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDateShort } from '@/lib/format'
import {
  getDashboardAccounts, getBalanceSums,
  getOpenSavingsGoals, getDashboardCryptoAssets, getLatestAssetValuations, getActiveContracts,
  getOpenInsights, getActiveValuables, getNetWorthSnapshotsSince,
} from '@/lib/data/overview'
import { getActiveDebts } from '@/lib/data/finance-planning'
import { getBankBalances } from '@/lib/data/finance-accounts'
import {
  buildCryptoPortfolio, buildFixedCosts, computeAccountBalances, computeInventory,
  computeLiveBuckets, computeUpcomingRenewals,
} from '@/lib/finance/dashboard-calc'
import { getMonthlyFlows } from '@/lib/data/flows'
import {
  FLOW_DEFAULT_KEY, INCLUDE_ALL, flowDefaultFrom, includeForDefault, monthlyCategorySeries, monthlySeries, sumFlows,
} from '@/lib/finance/flow-calc'

// ─── Shared card ──────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card ${className}`}>{children}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
/**
 * Einheitlicher Kopf für alle Abschnitte des Dashboards: gleiche Typo, gleicher Abstand
 * nach unten, optionaler Zähler und optionaler Link rechts. Vorher war jeder Abschnitt
 * einzeln ausgeschrieben — dadurch unterschiedliche Höhen und Abstände.
 */
function SectionHeader({ title, count, href, linkLabel = 'Alle ansehen' }: {
  title: string
  count?: string | number
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 min-h-6">
      <h2 className="text-sm font-semibold">
        {title}
        {count != null && count !== 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">{count}</span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}

export default async function DashboardPage() {
  const { supabase, user } = await requireAuthUser()

  const settings      = await getSettings(user!.id)
  const locale        = (settings.number_format  as string) ?? 'de-DE'
  const dateFormat    = (settings.date_format    as string) ?? 'dd.MM.yyyy'
  const monthlyBudget = (settings.monthly_budget as number) ?? null

  const fmt     = (n: number, currency = 'EUR') => fmtCurrency(n, currency, locale)
  const fmtDate = (d: string | Date | null)      => fmtDateShort(d, dateFormat)

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // ── Parallel data fetching ────────────────────────────────────────────────
  // Net-Worth-Snapshots: letzte 2 Jahre; Monatszusammenfassungen: letzte 12 Monate
  // (month ist als "YYYY-MM-01" gespeichert).
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const fromMonth = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`
  const snapshotFrom = new Date()
  snapshotFrom.setFullYear(snapshotFrom.getFullYear() - 2)

  const [
    accounts,
    balanceSums,
    flowRows,
    debts,
    goals,
    cryptoAssetsRaw,
    contractsRaw,
    insights,
    cryptoTargets,
    lastRebalancing,
    depotSummaries,
    valuables,
    netWorthSnapshots,
    bankBalances,
  ] = await Promise.all([
    getDashboardAccounts(supabase, user!.id),
    // unified_transactions (siehe Migration 20260821010000) enthält auch FinTS-Buchungen
    // verknüpfter Konten. Für Kontostände ohne flow_kind-Filter, für „diesen Monat" nur echte.
    getBalanceSums(supabase, user!.id),
    // Eine Quelle für alle Einnahmen/Ausgaben (monthly_flows): Monatskachel und Finanzanalyse
    // lesen dieselben Zeilen, nur mit anderem Filter.
    getMonthlyFlows(supabase, user!.id, { from: fromMonth }),
    getActiveDebts(supabase, user!.id),
    getOpenSavingsGoals(supabase, user!.id),
    getDashboardCryptoAssets(supabase, user!.id),
    getActiveContracts(supabase, user!.id),
    getOpenInsights(supabase, user!.id),
    getRebalancingTargets(user!.id),
    getLastRebalancing(user!.id),
    getDepotsSummaries(),
    getActiveValuables(supabase, user!.id),
    getNetWorthSnapshotsSince(supabase, user!.id, snapshotFrom.toISOString().split('T')[0]),
    getBankBalances(supabase, user!.id),
  ])

  // Inventar: getrennt vom Vermögen (Wert ist geschätzt).
  const { wert: inventarWert, stueck: inventarStueck } = computeInventory(valuables)

  const activeAccounts = accounts.filter(a => a.is_active)
  const contracts = contractsRaw

  // ── Kontostände (Bankstand gewinnt bei verknüpften Konten) ────────────────
  const bankBalanceByIban = new Map(bankBalances.map(b => [b.account_iban, Number(b.booked_balance)]))
  const balMap = computeAccountBalances(accounts, balanceSums, bankBalanceByIban)

  // ── Monatsbilanz ──────────────────────────────────────────────────────────
  // Einnahmen/Ausgaben insgesamt (inkl. Anlage und Forderungen) plus die Aufschlüsselung.
  // Das Budget bezieht sich auf Konsum und rechnet deshalb nur mit `echt`.
  const monthRows = flowRows.filter(r => r.month === monthStart)
  const monthTotals = sumFlows(monthRows, INCLUDE_ALL)
  const { income: monthIncome, expense: monthExpense, net: monthNet } = monthTotals
  const monthConsumption = monthTotals.echt.expense

  // Finanzanalyse: gleiche Sicht wie die Analyse-Seite ohne URL-Parameter, also der Standard aus den Einstellungen
  // (Analyse -> „Anlagen & Forderungen"; ohne Einstellung: alles eingerechnet).
  const analyseInclude = includeForDefault(flowDefaultFrom(settings[FLOW_DEFAULT_KEY]))
  // Bis einschließlich laufender Monat: vordatierte Buchungen in der Zukunft gehören nicht in „letzte N Monate".
  const analyticsSummaries = monthlySeries(flowRows, analyseInclude).filter(m => m.month <= monthStart).map(m => ({
    month: m.month, total_income: m.income, total_expenses: m.expense, net_balance: m.net,
  }))
  const categorySeries = monthlyCategorySeries(flowRows.filter(r => r.month <= monthStart), analyseInclude)

  // ── Crypto portfolio ──────────────────────────────────────────────────────
  const cryptoVals = await getLatestAssetValuations(supabase, cryptoAssetsRaw.map(a => a.id))
  const { cryptoAssets, total: cryptoTotal, totalCost: cryptoTotalCost } =
    buildCryptoPortfolio(cryptoAssetsRaw, cryptoVals)

  // ── Net Worth ─────────────────────────────────────────────────────────────
  // Nur aktive Konten — fn_take_snapshot filtert genauso.
  const financeTotal  = activeAccounts.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0)
  const depotTotal    = depotSummaries.reduce((s, d) => s + (d.depotValue ?? 0), 0)

  /**
   * Nettovermögen = Konten + Krypto + Depot. Festgelegt am 2026-09-02.
   *
   * Vorher rechnete diese Kachel `+ savingsTotal + lentTotal − borrowedTotal` und
   * lief damit an der Snapshot-Historie vorbei: die Kachel zeigte 14.238,61 €, die
   * Kurve daneben 13.694,93 €, und der als „heute" angehängte Punkt im Verlauf war
   * nach einer anderen Formel gerechnet als jeder Punkt links davon.
   *
   * Die drei Posten sind absichtlich draußen:
   *  • Sparziele haben keine Kontoverknüpfung. Die 1.610 € für die China-Reise
   *    liegen auf dem Girokonto und steckten damit doppelt im Nettovermögen.
   *  • Verliehenes und geschuldetes Geld stehen als eigene Kacheln daneben —
   *    dieselbe Trennung wie beim Inventar (siehe oben).
   */
  const netWorth = financeTotal + cryptoTotal + depotTotal

  // Nur noch für die Kacheln neben dem Nettovermögen, nicht mehr Teil davon.
  const borrowedTotal = debts.filter(d => d.type === 'borrowed').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const lentTotal     = debts.filter(d => d.type === 'lent').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const savingsTotal  = goals.reduce((s, g) => s + (g.current_amount ?? 0), 0)

  // ── Today's snapshot for chart (live data point) ──────────────────────────
  const liveBuckets = computeLiveBuckets(activeAccounts, balMap)
  const todayDateStr = now.toISOString().split('T')[0]
  const todaySnapshot = {
    snapshot_date:    todayDateStr,
    net_worth:        netWorth,
    total_checking:   liveBuckets.checking,
    total_investment: liveBuckets.investment,
    total_savings:    liveBuckets.savings,
    total_cash:       liveBuckets.cash,
    total_depot:      depotTotal,
    // Kryptokonten sind Konten, keine Positionen — genau wie in fn_take_snapshot
    // kommen sie zum Positionswert dazu.
    total_crypto:     cryptoTotal + liveBuckets.crypto,
    total_bausparer:  liveBuckets.bausparer,
    // 'business' ist kein erlaubter Kontotyp mehr; die Spalte trägt nur noch Historie.
    total_business:   0,
    // Schulden aus KONTEN vom Typ 'credit', nicht aus der Tabelle `debts` —
    // wie im Snapshot. Sonst wäre der heutige Punkt wieder anders gerechnet.
    total_debts:      Math.abs(liveBuckets.debts),
    total_assets:     0,
  }
  const snapshotsWithToday = netWorthSnapshots.filter(s => s.snapshot_date !== todayDateStr).concat(todaySnapshot)

  // ── Rebalancing ───────────────────────────────────────────────────────────
  const rebResult        = calculateRebalancing(cryptoTargets, cryptoAssets, cryptoTotal)
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
  const { contracts: contractsForWidget, total: fixedCostsTotal } = buildFixedCosts(contracts)

  // ── Contract renewals ─────────────────────────────────────────────────────
  const upcoming = computeUpcomingRenewals(contracts, now)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 space-y-8 mx-auto w-full max-w-[1600px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {now.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <AthenaInsights insights={insights} />

      {/* ── Row 1: Net Worth + Monat + Crypto ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Net Worth */}
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Net Worth</p>
          <p className={`text-4xl font-bold tabular-nums tracking-tight ${netWorth < 0 ? 'text-danger' : ''}`}>
            {fmt(netWorth)}
          </p>
          {/* Oben die Posten, die die Zahl darüber ergeben — die Summe muss aufgehen.
              Unten, hinter der Trennlinie, was daneben steht: Sparziele liegen schon
              auf dem Girokonto, Schulden und Forderungen sind per Entscheidung vom
              2026-09-02 nicht Teil des Nettovermögens. Vorher stand alles in einem
              Block und sah damit aus, als würde es sich zur Zahl oben addieren. */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {([
              ['Konten',          liveBuckets.checking + liveBuckets.savings + liveBuckets.cash + liveBuckets.bausparer],
              ['Geschäftsanteile', liveBuckets.investment],
              ['Depot',           depotTotal],
              ['Krypto',          cryptoTotal + liveBuckets.crypto],
            ] as [string, number][]).filter(([, val]) => val !== 0).map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold tabular-nums">{fmt(val)}</p>
              </div>
            ))}
          </div>

          {[savingsTotal, borrowedTotal, lentTotal].some(v => v > 0) && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Nicht im Net Worth
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {([
                  ['Sparziele',      savingsTotal,   'neutral'],
                  ['Ich schulde',    borrowedTotal,  'red'],
                  ['Mir geschuldet', lentTotal,      lentTotal > 0 ? 'green' : 'neutral'],
                ] as [string, number, 'neutral' | 'red' | 'green'][]).filter(([, val]) => val > 0).map(([label, val, color]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-sm font-semibold tabular-nums ${
                      color === 'red'   ? 'text-danger' :
                      color === 'green' ? 'text-success' : ''
                    }`}>
                      {color === 'red' ? '−' : ''}{fmt(val)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                <p className={`text-4xl font-bold tabular-nums tracking-tight ${monthNet >= 0 ? 'text-success' : 'text-danger'}`}>
                  {monthNet >= 0 ? '+' : ''}{fmt(monthNet)}
                </p>
                {monthNet >= 0
                  ? <TrendingUp  className="size-5 text-success" />
                  : <TrendingDown className="size-5 text-danger"  />
                }
              </div>
              <div className="flex gap-5">
                <div className="flex items-start gap-1.5">
                  <ArrowUpRight className="size-4 text-success shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Einnahmen</p>
                    <p className="text-sm font-semibold tabular-nums text-success">{fmt(monthIncome)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <ArrowDownRight className="size-4 text-danger shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Ausgaben</p>
                    <p className="text-sm font-semibold tabular-nums text-danger">{fmt(monthExpense)}</p>
                  </div>
                </div>
              </div>

              {/* Aufschlüsselung: was in Einnahmen/Ausgaben oben steckt, aber kein Konsum ist.
                  Dieselbe Trennung (flow_kind) wie in der Analyse. */}
              {(monthTotals.anlage.income + monthTotals.anlage.expense + monthTotals.forderung.income + monthTotals.forderung.expense) > 0 && (
                <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Konsum-Saldo</dt>
                    <dd className="tabular-nums">{fmt(monthTotals.echt.income - monthTotals.echt.expense)}</dd>
                  </div>
                  {(monthTotals.anlage.income + monthTotals.anlage.expense) > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">davon Anlage (Krypto, Depot, Bauspar)</dt>
                      <dd className="tabular-nums">
                        {monthTotals.anlage.expense > 0 && <span className="text-danger">−{fmt(monthTotals.anlage.expense)}</span>}
                        {monthTotals.anlage.expense > 0 && monthTotals.anlage.income > 0 && ' / '}
                        {monthTotals.anlage.income > 0 && <span className="text-success">+{fmt(monthTotals.anlage.income)}</span>}
                      </dd>
                    </div>
                  )}
                  {(monthTotals.forderung.income + monthTotals.forderung.expense) > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">davon Forderungen/Schulden</dt>
                      <dd className="tabular-nums">
                        {monthTotals.forderung.expense > 0 && <span className="text-danger">−{fmt(monthTotals.forderung.expense)}</span>}
                        {monthTotals.forderung.expense > 0 && monthTotals.forderung.income > 0 && ' / '}
                        {monthTotals.forderung.income > 0 && <span className="text-success">+{fmt(monthTotals.forderung.income)}</span>}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {/* Budget bar */}
              {monthlyBudget != null && monthlyBudget > 0 && (
                <div className="mt-4 space-y-1">
                  {(() => {
                    const pct = Math.min(100, Math.round((monthConsumption / monthlyBudget) * 100))
                    const over = monthConsumption > monthlyBudget
                    return (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Budget</span>
                          <span className={`tabular-nums ${over ? 'text-danger font-medium' : ''}`}>
                            {fmt(monthConsumption)} / {fmt(monthlyBudget)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${over ? 'bg-danger' : pct > 80 ? 'bg-warning' : 'bg-primary'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
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

      {/* ── Net-Worth-Verlauf + Aufteilung ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0">
          <NetWorthChart snapshots={snapshotsWithToday} />
        </div>
        {/* Dieselben Bausteine wie in der Net-Worth-Kachel, damit die Mitte des Rings
            dieselbe Summe zeigt. `financeTotal` wäre hier falsch: es enthält die
            Geschäftsanteile schon mit, die als eigener Ring ausgewiesen werden. */}
        <PortfolioDonut
          kontenTotal={liveBuckets.checking + liveBuckets.savings + liveBuckets.cash + liveBuckets.bausparer}
          investmentTotal={liveBuckets.investment}
          depotTotal={depotTotal}
          cryptoTotal={cryptoTotal + liveBuckets.crypto}
          locale={locale}
        />
      </div>

      {/* ── Finanzanalyse ─────────────────────────────────────────────────────── */}
      {analyticsSummaries.length > 0 && (
        <FinanceAnalytics summaries={analyticsSummaries} categorySeries={categorySeries} locale={locale} />
      )}

      {/* ── Depots ────────────────────────────────────────────────────────────── */}
      {depotSummaries.length > 0 && (
        <div>
          <SectionHeader title="Depots" count={depotSummaries.length} href="/depot" linkLabel="Zum Depot" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {depotSummaries.map(d => {
              const hasValue = d.depotValue !== null && d.depotValue > 0
              return (
                <Link key={d.id} href="/depot">
                  <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
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
                        <p className={`text-xs font-medium tabular-nums ${d.returnPct >= 0 ? 'text-success' : 'text-danger'}`}>
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

      {/* ── Inventar ──────────────────────────────────────────────────────────── */}
      {/* Eigene Kachel statt einer Zeile in der Vermoegensaufteilung: der Sammlungswert ist
          geschaetzt und soll neben den harten Zahlen stehen, nicht in ihnen. Der Hinweis
          darunter sagt das explizit -- sonst rechnet man ihn im Kopf doch dazu. */}
      {inventarStueck > 0 && (
        <div>
          <SectionHeader title="Inventar" count={`${inventarStueck} Stück`} href="/inventar" linkLabel="Zur Vitrine" />
          <Link href="/inventar">
            <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    <Gem className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-bold tabular-nums leading-tight">{fmt(inventarWert)}</p>
                    <p className="text-xs text-muted-foreground">
                      Sammlungswert · geschätzt, nicht Teil des Vermögens
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* ── Rebalancing alert ──────────────────────────────────────────────────── */}
      <RebalancingAlert rebalancingVolume={rebalancingVolume} lastRebalancing={lastRebalancing} locale={locale} dateFormat={dateFormat} />

      {/* ── Konten ────────────────────────────────────────────────────────────── */}
      <div>
        <SectionHeader title="Konten" count={`${activeAccounts.length} aktiv`} href="/finance/accounts" />

        {activeAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">Keine aktiven Konten.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {activeAccounts.map(a => {
              const bal = balMap.get(a.id) ?? 0
              const neg = bal < 0
              const hasTransactions = balanceSums.some(t => t.account_id === a.id && t.tx_count > 0)
              return (
                <Link key={a.id} href={`/finance/accounts/${a.id}`}>
                  <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      {a.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />}
                      <p className="text-xs text-muted-foreground font-medium truncate">{a.name}</p>
                    </div>
                    <p className={`text-xl font-bold tabular-nums leading-tight ${neg ? 'text-danger' : ''}`}>
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
          <SectionHeader
            title="Sparziele"
            count={goals.length > 0 ? `${goals.length} aktiv` : undefined}
            href="/finance/goals"
          />
          {goals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">Keine aktiven Sparziele</p>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.slice(0, 5).map((g) => {
                const current = g.current_amount ?? 0
                const missing = Math.max(0, g.target_amount - current)
                const pct = Math.min(100, Math.round((current / g.target_amount) * 100))
                const done = pct >= 100
                return (
                  <Card key={g.id} className="p-4">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-sm font-medium truncate">{g.description}</p>
                      {done ? (
                        <span className="text-xs font-medium text-success shrink-0">Erreicht ✓</span>
                      ) : (
                        <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
                          noch <span className="text-foreground font-medium">{fmt(missing)}</span>
                        </p>
                      )}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${done ? 'bg-success' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1 tabular-nums">
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
          <SectionHeader
            title="Kündbarkeit in Kürze"
            count={upcoming.length > 0 ? upcoming.length : undefined}
            href="/finance/contracts"
          />
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
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
                    className={`rounded-lg border p-4 flex items-center justify-between gap-3 ${
                      overdue || urgent ? 'border-danger/30 bg-danger/10'
                      : warning        ? 'border-warning/30 bg-warning/10'
                      : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {overdue || urgent ? <AlertCircle className="size-4 text-danger shrink-0" />
                        : warning        ? <Clock       className="size-4 text-warning shrink-0" />
                        :                  <Minus       className="size-4 text-muted-foreground/40 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.provider ? `${c.provider} · ` : ''}
                          <span className="tabular-nums">{fmt(c.amount, c.currency)}/{c.frequency}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        overdue || urgent ? 'text-danger'
                        : warning        ? 'text-warning'
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
