import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Datenzugriff Depot. Reine Funktionen: Client und userId kommen vom Aufrufer.
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
const DEPOT_COLUMNS = 'id, user_id, name, isin, created_at'

export async function getDepots(supabase: DB, userId: string): Promise<Depot[]> {
  const { data } = await supabase
    .from('depots')
    .select(DEPOT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return (data ?? []) as Depot[]
}

/** Alle Transaktionen einer ISIN (unbegrenzt: fließen in Bestand/Summen ein). */
export async function getDepotTransactions(
  supabase: DB,
  userId: string,
  isin: string,
): Promise<DepotTransaction[]> {
  const { data } = await supabase
    .from('depot_transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('isin', isin)
    .eq('user_id', userId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as DepotTransaction[]
}

/** Gibt es für die ISIN bereits eine "initial"-Transaktion? */
export async function hasInitialTransaction(supabase: DB, userId: string, isin: string): Promise<boolean> {
  const { data } = await supabase
    .from('depot_transactions')
    .select('id')
    .eq('isin', isin)
    .eq('user_id', userId)
    .eq('transaction_type', 'initial')
    .limit(1)
  return !!data && data.length > 0
}

export async function getSavingsPlans(supabase: DB, userId: string): Promise<SavingsPlan[]> {
  const { data } = await supabase
    .from('savings_plans')
    .select(SAVINGS_PLAN_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SavingsPlan[]
}

/** Einzelner Sparplan; null wenn nicht gefunden (oder Fehler). */
export async function getSavingsPlan(
  supabase: DB,
  userId: string,
  planId: string,
): Promise<SavingsPlan | null> {
  const { data, error } = await supabase
    .from('savings_plans')
    .select(SAVINGS_PLAN_COLUMNS)
    .eq('id', planId)
    .eq('user_id', userId)
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
  userId: string,
  isin: string,
): Promise<PortfolioHistoryPoint[]> {
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
      .eq('user_id', userId)
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
export async function getDepotsSummaries(supabase: DB, userId: string): Promise<DepotWithSummary[]> {
  const depots = await getDepots(supabase, userId)
  if (!depots.length) return []

  const isins = depots.map(d => d.isin)

  const [{ data: transactions }, { data: caches }, { data: history }] = await Promise.all([
    supabase
      .from('depot_transactions')
      .select('isin, amount_eur, shares')
      .eq('user_id', userId)
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
    const txs       = (transactions ?? []).filter(t => t.isin === depot.isin)
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
