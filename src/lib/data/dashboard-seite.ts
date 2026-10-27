import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getRebalancingTargets, getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import { getDepotsSummaries } from '@/lib/data/depot'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'
import {
  getDashboardAccounts, getBalanceSums, getOpenSavingsGoals, getDashboardCryptoAssets,
  getLatestAssetValuations, getActiveContracts, getOpenInsights, getActiveValuables, getNetWorthSnapshotsSince,
} from '@/lib/data/overview'
import { getActiveDebts } from '@/lib/data/finance-planning'
import { getBankBalances } from '@/lib/data/finance-accounts'
import { getMonthlyFlowsScope } from '@/lib/data/flows-scope'
import {
  buildCryptoPortfolio, buildFixedCosts, computeAccountBalances, computeInventory,
  computeLiveBuckets, computeUpcomingRenewals,
} from '@/lib/finance/dashboard-calc'
import {
  FLOW_DEFAULT_KEY, INCLUDE_ALL, flowDefaultFrom, includeForDefault, monthlyCategorySeries, monthlySeries, sumFlows,
} from '@/lib/finance/flow-calc'
import type { DashboardKern } from '@/lib/dashboard/typen'

/**
 * Rechnet den Kern des Dashboards in einem Durchgang (vorher stand das alles in page.tsx).
 *
 * Datum und Monatsanfang kommen aus deutscher Zeit: mit `new Date()` auf dem Server (UTC) zeigte
 * die Monatskachel in der ersten Nacht-Stunde des Monatsersten noch den Vormonat.
 */

type DB = SupabaseClient<Database>

const monatErster = (heute: string) => `${heute.slice(0, 7)}-01`

/**
 * `ctx` = Scope der Seite. Scope-faehig (applyAccountScope/applyOwnerScope in den Datenfunktionen): Konten, Salden, Monatsflows,
 * Schulden, Sparziele, Krypto-Assets, Vertraege, Depots, Inventar. OWNER-ONLY: Hinweise (insights), Rebalancing-Ziele
 * (user_settings). Verlauf: Snapshots ohne Partner (wie bisher), mit Partner `net_worth_series` (networth-reihe.ts).
 * Fuer einen Nutzer ohne Partner liefert Scope 'ich' dieselben Werte wie vor der Umstellung.
 */
export async function ladeDashboard(
  supabase: DB, ctx: ScopeContext, settings: Record<string, unknown>, heute: string,
): Promise<DashboardKern> {
  const userId = ctx.userId
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'
  const monatsBudget = typeof settings.monthly_budget === 'number' ? settings.monthly_budget : null

  const monthStart = monatErster(heute)
  const [j, m, t] = heute.split('-').map(Number)
  const jetzt = new Date(j, m - 1, t, 12)
  // Flows: letzte 12 Monate (month ist als YYYY-MM-01 gespeichert); Snapshots: letzte 2 Jahre.
  const fromMonth = monatErster(new Date(Date.UTC(j, m - 1 - 12, 1)).toISOString().slice(0, 10))
  // Date.UTC rollt ungueltige Tage weiter (29.02. minus 2 Jahre -> 01.03.) statt ein ungueltiges
  // Datum zu bauen, das die Abfrage still verwirft und den Verlauf leer laesst.
  const snapshotFrom = new Date(Date.UTC(j - 2, m - 1, t)).toISOString().slice(0, 10)

  const [
    accounts, balanceSums, flowRows, debts, goals, cryptoAssetsRaw, contracts, insights,
    cryptoTargets, lastRebalancing, depotSummaries, valuables, netWorthSnapshots, bankBalances,
  ] = await Promise.all([
    getDashboardAccounts(supabase, ctx),
    // unified_transactions enthält auch FinTS-Buchungen verknüpfter Konten. Für Kontostände
    // ohne flow_kind-Filter, für „diesen Monat" nur echte.
    getBalanceSums(supabase, ctx),
    getMonthlyFlowsScope(supabase, ctx, { from: fromMonth }),
    getActiveDebts(supabase, ctx),
    getOpenSavingsGoals(supabase, ctx),
    getDashboardCryptoAssets(supabase, ctx),
    getActiveContracts(supabase, ctx),
    getOpenInsights(supabase, ctx),
    getRebalancingTargets(userId), // OWNER-ONLY (user_settings)
    getLastRebalancing(userId),
    getDepotsSummaries(supabase, ctx),
    getActiveValuables(supabase, ctx),
    getNetWorthSnapshotsSince(supabase, ctx, snapshotFrom),
    getBankBalances(supabase, ctx),
  ])

  const { wert: inventarWert, stueck: inventarStueck } = computeInventory(valuables)
  const activeAccounts = accounts.filter(a => a.is_active)

  // ── Kontostände (Bankstand gewinnt bei verknüpften Konten) ────────────────
  const bankBalanceByIban = new Map(bankBalances.map(b => [b.account_iban, Number(b.booked_balance)]))
  const balMap = computeAccountBalances(accounts, balanceSums, bankBalanceByIban)

  // ── Monatsbilanz ──────────────────────────────────────────────────────────
  const monthRows = flowRows.filter(r => r.month === monthStart)
  const totals = sumFlows(monthRows, INCLUDE_ALL)
  const echtEinnahmen = totals.echt.income
  const sparquote = echtEinnahmen > 0 ? ((echtEinnahmen - totals.echt.expense) / echtEinnahmen) * 100 : null

  // Finanzanalyse: gleiche Sicht wie die Analyse-Seite ohne URL-Parameter.
  const analyseInclude = includeForDefault(flowDefaultFrom(settings[FLOW_DEFAULT_KEY]))
  const summaries = monthlySeries(flowRows, analyseInclude)
    .filter(s => s.month <= monthStart)
    .map(s => ({ month: s.month, total_income: s.income, total_expenses: s.expense, net_balance: s.net }))
  const categorySeries = monthlyCategorySeries(flowRows.filter(r => r.month <= monthStart), analyseInclude)

  // ── Krypto ────────────────────────────────────────────────────────────────
  const cryptoVals = await getLatestAssetValuations(supabase, cryptoAssetsRaw.map(a => a.id))
  const { cryptoAssets, total: cryptoTotal, totalCost: cryptoTotalCost } = buildCryptoPortfolio(cryptoAssetsRaw, cryptoVals)

  // ── Net Worth = Konten + Krypto + Depot (festgelegt 2026-09-02) ───────────
  // Sparziele haben keine Kontoverknüpfung (stecken schon im Konto), Verliehenes und Geschuldetes
  // stehen daneben — dieselbe Trennung wie beim Inventar.
  const financeTotal = activeAccounts.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0)
  const depotTotal = depotSummaries.reduce((s, d) => s + (d.depotValue ?? 0), 0)
  const netWorth = financeTotal + cryptoTotal + depotTotal

  const borrowedTotal = debts.filter(d => d.type === 'borrowed').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const lentTotal = debts.filter(d => d.type === 'lent').reduce((s, d) => s + (d.outstanding ?? 0), 0)
  const savingsTotal = goals.reduce((s, g) => s + (g.current_amount ?? 0), 0)

  // ── Live-Punkt für den Verlauf ────────────────────────────────────────────
  const live = computeLiveBuckets(activeAccounts, balMap)
  const heutePunkt = {
    datum: heute,
    net_worth: netWorth,
    total_checking: live.checking,
    total_investment: live.investment,
    total_savings: live.savings,
    total_cash: live.cash,
    total_depot: depotTotal,
    // Kryptokonten sind Konten, keine Positionen — wie in fn_take_snapshot kommen sie zum Positionswert dazu.
    total_crypto: cryptoTotal + live.crypto,
    total_bausparer: live.bausparer,
    // 'business' ist kein Kontotyp mehr; die Spalte trägt nur noch Historie.
    total_business: 0,
    // Schulden aus KONTEN vom Typ 'credit', wie im Snapshot.
    total_debts: Math.abs(live.debts),
    total_assets: 0,
  }
  const snapshots = netWorthSnapshots
    .filter(s => s.snapshot_date !== heute)
    .map(s => ({
      datum: s.snapshot_date, net_worth: Number(s.net_worth), total_assets: Number(s.total_assets),
      total_checking: Number(s.total_checking), total_investment: Number(s.total_investment),
      total_savings: Number(s.total_savings), total_cash: Number(s.total_cash), total_depot: Number(s.total_depot),
      total_crypto: Number(s.total_crypto), total_bausparer: Number(s.total_bausparer),
      total_business: Number(s.total_business), total_debts: Number(s.total_debts),
    }))
    .concat([heutePunkt])

  // ── Rebalancing, Fixkosten, Fristen ───────────────────────────────────────
  const reb = calculateRebalancing(cryptoTargets, cryptoAssets, cryptoTotal)
  const topAssets = [...cryptoAssets]
    .filter(a => (a.current_value ?? 0) > 0)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, 4)
    .map(a => {
      const rebRow = reb.rows.find(r => r.coingecko_id === a.symbol)
      return {
        symbol: rebRow?.symbol ?? (a.name ?? a.symbol ?? '?'),
        value: a.current_value ?? 0,
        pct: cryptoTotal > 0 ? ((a.current_value ?? 0) / cryptoTotal) * 100 : 0,
      }
    })
  const { contracts: fixVertraege, total: fixTotal } = buildFixedCosts(contracts)

  return {
    heute, locale, dateFormat,
    scopeCtx: ctx,
    netWorth,
    buckets: {
      konten: live.checking + live.savings + live.cash + live.bausparer,
      geschaeftsanteile: live.investment,
      depot: depotTotal,
      krypto: cryptoTotal + live.crypto,
    },
    nichtImNetWorth: { sparziele: savingsTotal, ichSchulde: borrowedTotal, mirGeschuldet: lentTotal },
    snapshots,
    monat: {
      label: jetzt.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      start: monthStart,
      einnahmen: totals.income, ausgaben: totals.expense, netto: totals.net, konsum: totals.echt.expense,
      echt: totals.echt, anlage: totals.anlage, forderung: totals.forderung,
      sparquote,
      leer: totals.income === 0 && totals.expense === 0,
    },
    monatsBudget,
    konten: activeAccounts.map(a => ({
      id: a.id, name: a.name, type: a.type, color: a.color ?? null, currency: a.currency,
      saldo: balMap.get(a.id) ?? 0,
      hatBuchungen: balanceSums.some(s => s.account_id === a.id && s.tx_count > 0),
    })),
    depots: depotSummaries,
    krypto: {
      gesamt: cryptoTotal,
      kosten: cryptoTotalCost > 0 ? cryptoTotalCost : null,
      rebalancingVolumen: reb.rebalancing_volume,
      lastRebalancing,
      topAssets,
    },
    inventar: { wert: inventarWert, stueck: inventarStueck },
    sparziele: goals.map(g => ({
      id: g.id, description: g.description, current: g.current_amount ?? 0, target: g.target_amount,
    })),
    fixkosten: { total: fixTotal, vertraege: fixVertraege, konten: accounts.map(a => ({ id: a.id, name: a.name })) },
    kuendbar: computeUpcomingRenewals(contracts, jetzt),
    insights,
    analytik: { summaries, categorySeries },
  }
}
