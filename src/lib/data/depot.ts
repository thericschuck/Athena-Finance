import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner, scopeUserId } from '@/lib/data/scope-owner'

/**
 * Datenzugriff Depot. Reine Funktionen: Client und Scope kommen vom Aufrufer.
 * Haushaltssicht ueber `ScopeContext` (Depots eigene ODER geteilt; Transaktionen folgen dem Depot ueber (user_id, isin)).
 */
type DB = SupabaseClient<Database>

export type DepotTransaction = {
  id: string
  user_id: string
  isin: string
  fund_name: string
  transaction_date: string
  amount_eur: number
  price_per_share: number
  shares: number
  transaction_type: 'initial' | 'buy' | 'savings_plan'
  notes: string | null
  created_at: string
}

export type SavingsPlan = {
  id: string
  user_id: string
  isin: string
  fund_name: string
  monthly_amount: number
  execution_day: number
  start_date: string
  is_active: boolean
  created_at: string
}

export type Depot = {
  id: string
  user_id: string
  name: string
  isin: string
  shared: boolean
  created_at: string
}

export type DepotSummary = {
  totalShares: number
  totalInvested: number
  livePrice: number | null
  depotValue: number | null
  returnPct: number | null
}

export type DepotWithSummary = Depot & DepotSummary

export type PortfolioHistoryPoint = {
  date: string
  price: number
  totalShares: number
  totalInvested: number
  portfolioValue: number
  returnPct: number
}

const TRANSACTION_COLUMNS =
  'id, user_id, isin, fund_name, transaction_date, amount_eur, price_per_share, shares, transaction_type, notes, created_at'
const SAVINGS_PLAN_COLUMNS =
  'id, user_id, isin, fund_name, monthly_amount, execution_day, start_date, is_active, created_at'
const DEPOT_COLUMNS = 'id, user_id, name, isin, shared, created_at'

export async function getDepots(supabase: DB, ctx: ScopeContext): Promise<Depot[]> {
  const { data } = await scopedOwner(supabase.from('depots').select(DEPOT_COLUMNS), ctx)
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as Depot[]
  // Dieselbe ISIN bei mehreren Haushaltsmitgliedern: im Haushaltsscope ein Eintrag je ISIN (aeltester);
  // Bestand/Verlauf aggregieren ueber die sichtbaren Besitzer (siehe visibleOwnersByIsin).
  const seen = new Set<string>()
  return rows.filter(d => (seen.has(d.isin) ? false : (seen.add(d.isin), true)))
}

/** Besitzer der sichtbaren Depots je ISIN (Transaktionen gehoeren zu (user_id, isin) eines sichtbaren Depots). */
async function visibleOwnersByIsin(supabase: DB, ctx: ScopeContext, isins?: string[]): Promise<Map<string, string[]>> {
  let q = scopedOwner(supabase.from('depots').select('user_id, isin'), ctx)
  if (isins) q = q.in('isin', isins)
  const { data } = await q
  const map = new Map<string, string[]>()
  for (const d of data ?? []) {
    const list = map.get(d.isin) ?? []
    if (!list.includes(d.user_id)) list.push(d.user_id)
    map.set(d.isin, list)
  }
  return map
}

/** Ist das sichtbare Depot zu dieser ISIN mit dem Haushalt geteilt? (Neue Sparplaene erben das Flag.) */
export async function isDepotShared(supabase: DB, ctx: ScopeContext, isin: string): Promise<boolean> {
  const { data } = await scopedOwner(supabase.from('depots').select('shared'), ctx).eq('isin', isin).limit(1)
  return !!data?.[0]?.shared
}

/** Besitzer-ID, dem neue Transaktionen/Plaene zu dieser ISIN zugeordnet werden: Besitzer des sichtbaren Depots, sonst der Handelnde. */
export async function resolveDepotOwner(supabase: DB, ctx: ScopeContext, isin: string): Promise<string> {
  const own = scopeUserId(ctx)
  const owners = (await visibleOwnersByIsin(supabase, ctx, [isin])).get(isin) ?? []
  return owners.includes(own) || owners.length === 0 ? own : owners[0]
}

/** Alle Transaktionen einer ISIN (unbegrenzt: fließen in Bestand/Summen ein). */
export async function getDepotTransactions(
  supabase: DB,
  ctx: ScopeContext,
  isin: string,
): Promise<DepotTransaction[]> {
  const owners = (await visibleOwnersByIsin(supabase, ctx, [isin])).get(isin) ?? []
  if (owners.length === 0) return []
  const { data } = await supabase
    .from('depot_transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('isin', isin)
    .in('user_id', owners)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as DepotTransaction[]
}

/** Gibt es für die ISIN bereits eine "initial"-Transaktion? */
export async function hasInitialTransaction(supabase: DB, ctx: ScopeContext, isin: string): Promise<boolean> {
  const owners = (await visibleOwnersByIsin(supabase, ctx, [isin])).get(isin) ?? [scopeUserId(ctx)]
  const { data } = await supabase
    .from('depot_transactions')
    .select('id')
    .eq('isin', isin)
    .in('user_id', owners)
    .eq('transaction_type', 'initial')
    .limit(1)
  return !!data && data.length > 0
}

export async function getSavingsPlans(supabase: DB, ctx: ScopeContext): Promise<SavingsPlan[]> {
  const { data } = await scopedOwner(supabase.from('savings_plans').select(SAVINGS_PLAN_COLUMNS), ctx)
    .order('created_at', { ascending: true })
  return (data ?? []) as SavingsPlan[]
}

/** Einzelner Sparplan; null wenn nicht gefunden (oder Fehler). */
export async function getSavingsPlan(
  supabase: DB,
  ctx: ScopeContext,
  planId: string,
): Promise<SavingsPlan | null> {
  const { data, error } = await scopedOwner(supabase.from('savings_plans').select(SAVINGS_PLAN_COLUMNS), ctx)
    .eq('id', planId)
    .single()
  if (error || !data) return null
  return data as SavingsPlan
}

/**
 * Kursverlauf + Positionsverlauf einer ISIN.
 * Lädt alle Kurse und Transaktionen der ISIN (unbegrenzt — Kandidat für Paginierung/
 * Downsampling bei langen Historien; die Werte laufen in die Verlaufskurve ein).
 */
export async function getPortfolioHistory(
  supabase: DB,
  ctx: ScopeContext,
  isin: string,
): Promise<PortfolioHistoryPoint[]> {
  const owners = (await visibleOwnersByIsin(supabase, ctx, [isin])).get(isin) ?? []
  if (owners.length === 0) return []
  const [{ data: prices }, { data: transactions }] = await Promise.all([
    supabase
      .from('fund_prices')
      .select('price_date, price')
      .eq('isin', isin)
      .order('price_date', { ascending: true }),
    supabase
      .from('depot_transactions')
      .select('transaction_date, amount_eur, shares')
      .eq('isin', isin)
      .in('user_id', owners)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (!prices || prices.length === 0 || !transactions) return []

  let totalShares = 0
  let totalInvested = 0
  let txIndex = 0
  const result: PortfolioHistoryPoint[] = []

  for (const { price_date, price } of prices) {
    while (txIndex < transactions.length && transactions[txIndex].transaction_date <= price_date) {
      totalShares   += Number(transactions[txIndex].shares)
      totalInvested += Number(transactions[txIndex].amount_eur)
      txIndex++
    }
    if (totalShares === 0) continue

    const portfolioValue = totalShares * Number(price)
    result.push({
      date: price_date,
      price: Number(price),
      totalShares,
      totalInvested,
      portfolioValue,
      returnPct: ((portfolioValue - totalInvested) / totalInvested) * 100,
    })
  }

  return result
}

/** Depots inkl. Bestand, Kurs und Rendite (für Konten-Seite und Dashboard). */
export async function getDepotsSummaries(supabase: DB, ctx: ScopeContext): Promise<DepotWithSummary[]> {
  const depots = await getDepots(supabase, ctx)
  if (!depots.length) return []

  const isins = depots.map(d => d.isin)
  const ownersByIsin = await visibleOwnersByIsin(supabase, ctx, isins)
  const txOwners = [...new Set([...ownersByIsin.values()].flat())]

  const [{ data: transactions }, { data: caches }, { data: history }] = await Promise.all([
    supabase
      .from('depot_transactions')
      .select('isin, user_id, amount_eur, shares')
      .in('user_id', txOwners)
      .in('isin', isins),
    supabase
      .from('fund_price_cache')
      .select('isin, price')
      .in('isin', isins),
    // Rückfallebene, wenn der Cache leer ist. Ohne sie stand depotValue auf null
    // und das Dashboard zeigte 0 € Depot, während fn_take_snapshot über
    // fn_fund_price_eur den letzten bekannten Kurs nimmt — die Kachel und die
    // Verlaufskurve wären damit sofort wieder auseinandergelaufen.
    // Unbegrenzt (gesamte Kurshistorie der ISINs) — Kandidat für eine "letzter Kurs"-View.
    supabase
      .from('fund_price_history')
      .select('isin, price, price_date')
      .in('isin', isins)
      .order('price_date', { ascending: false }),
  ])

  // Pro ISIN der jüngste Eintrag — die Abfrage liefert absteigend sortiert.
  const letzterKurs = new Map<string, number>()
  for (const row of history ?? []) {
    if (!letzterKurs.has(row.isin)) letzterKurs.set(row.isin, Number(row.price))
  }

  return depots.map(depot => {
    // Nur Transaktionen der Besitzer, deren Depot zu dieser ISIN sichtbar ist (nie privates Depot eines Peers).
    const owners    = ownersByIsin.get(depot.isin) ?? txOwners
    const txs       = (transactions ?? []).filter(t => t.isin === depot.isin && owners.includes(t.user_id))
    const cache     = caches?.find(c => c.isin === depot.isin)
    const totalShares   = txs.reduce((s, t) => s + Number(t.shares), 0)
    const totalInvested = txs.reduce((s, t) => s + Number(t.amount_eur), 0)
    // Dieselbe Kette wie fn_fund_price_eur: Tagescache, dann letzter bekannter
    // Kurs, dann mengengewichteter Einstandspreis. Nur wenn zu der ISIN gar
    // nichts bekannt ist, bleibt es null — dann zeigt die UI „—" statt 0 €.
    const livePrice     = cache?.price ? Number(cache.price)
                        : letzterKurs.get(depot.isin)
                        ?? (totalShares > 0 ? totalInvested / totalShares : null)
    const depotValue    = livePrice && totalShares > 0 ? totalShares * livePrice : null
    const returnPct     = depotValue && totalInvested > 0
      ? ((depotValue - totalInvested) / totalInvested) * 100
      : null
    return { ...depot, totalShares, totalInvested, livePrice, depotValue, returnPct }
  })
}
