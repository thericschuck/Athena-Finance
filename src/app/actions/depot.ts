'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type PortfolioHistoryPoint = {
  date: string
  price: number
  totalShares: number
  totalInvested: number
  portfolioValue: number
  returnPct: number
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

export type DepotSummary = {
  totalShares: number
  totalInvested: number
  livePrice: number | null
  depotValue: number | null
  returnPct: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

async function upsertFundPrice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isin: string,
  fund_name: string,
  price: number,
  date: string
) {
  return supabase.from('fund_prices').upsert(
    { isin, fund_name, price, price_date: date, currency: 'EUR' },
    { onConflict: 'isin,price_date' }
  )
}

// ─── V2 Actions ───────────────────────────────────────────────────────────────

export async function addInitialHolding(
  isin: string,
  fundName: string,
  shares: number,
  pricePerShare: number,
  date: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  if (shares <= 0) return { success: false, error: 'Anteile müssen größer als 0 sein' }
  if (pricePerShare <= 0) return { success: false, error: 'Kurs muss größer als 0 sein' }

  try {
    // Check: initial darf nur einmal pro ISIN existieren
    const { data: existing } = await supabase
      .from('depot_transactions')
      .select('id')
      .eq('isin', isin)
      .eq('user_id', user.id)
      .eq('transaction_type', 'initial')
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'Bestand wurde bereits eingetragen' }
    }

    const amount_eur = shares * pricePerShare

    await upsertFundPrice(supabase, isin, fundName, pricePerShare, date)
    const { error } = await supabase.from('depot_transactions').insert({
      user_id: user.id,
      isin,
      fund_name: fundName,
      transaction_date: date,
      amount_eur,
      price_per_share: pricePerShare,
      transaction_type: 'initial',
      notes: 'Bestandsübernahme',
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function addManualDeposit(
  isin: string,
  fundName: string,
  amountEur: number,
  pricePerShare: number,
  date: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  if (amountEur <= 0) return { success: false, error: 'Betrag muss größer als 0 sein' }
  if (pricePerShare <= 0) return { success: false, error: 'Kurs muss größer als 0 sein' }

  try {
    await upsertFundPrice(supabase, isin, fundName, pricePerShare, date)
    const { error } = await supabase.from('depot_transactions').insert({
      user_id: user.id,
      isin,
      fund_name: fundName,
      transaction_date: date,
      amount_eur: amountEur,
      price_per_share: pricePerShare,
      transaction_type: 'buy',
      notes: notes ?? null,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function getDepotTransactions(isin: string): Promise<DepotTransaction[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

  const { data } = await supabase
    .from('depot_transactions')
    .select('*')
    .eq('isin', isin)
    .eq('user_id', user.id)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })

  return (data ?? []) as DepotTransaction[]
}

export async function getPortfolioHistory(isin: string): Promise<PortfolioHistoryPoint[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

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
      .eq('user_id', user.id)
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

export async function deleteDepotTransaction(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  try {
    const { error } = await supabase
      .from('depot_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

// ─── Savings Plans ────────────────────────────────────────────────────────────

export async function createSavingsPlan(
  isin: string,
  fundName: string,
  monthlyAmount: number,
  executionDay: number,
  startDate: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  if (monthlyAmount <= 0) return { success: false, error: 'Betrag muss größer als 0 sein' }
  if (executionDay < 1 || executionDay > 28) return { success: false, error: 'Ausführungstag muss zwischen 1 und 28 liegen' }

  try {
    const { error } = await supabase.from('savings_plans').insert({
      user_id: user.id, isin, fund_name: fundName, monthly_amount: monthlyAmount,
      execution_day: executionDay, start_date: startDate,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function getSavingsPlans(): Promise<SavingsPlan[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

  const { data } = await supabase
    .from('savings_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (data ?? []) as SavingsPlan[]
}

export async function toggleSavingsPlan(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  try {
    const { error } = await supabase
      .from('savings_plans')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function deleteSavingsPlan(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  try {
    const { error } = await supabase
      .from('savings_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function executeSavingsPlanPayment(
  planId: string,
  pricePerShare: number
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  try {
    const { data: plan, error: planErr } = await supabase
      .from('savings_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single()

    if (planErr || !plan) return { success: false, error: 'Sparplan nicht gefunden' }
    if (pricePerShare <= 0) return { success: false, error: 'Kurs muss größer als 0 sein' }

    const today = new Date().toISOString().split('T')[0]

    await upsertFundPrice(supabase, plan.isin, plan.fund_name, pricePerShare, today)

    const { error } = await supabase.from('depot_transactions').insert({
      user_id: user.id,
      isin: plan.isin,
      fund_name: plan.fund_name,
      transaction_date: today,
      amount_eur: plan.monthly_amount,
      price_per_share: pricePerShare,
      transaction_type: 'savings_plan',
      notes: `Sparplan-Ausführung`,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

// ─── Depots ───────────────────────────────────────────────────────────────────

export type Depot = {
  id: string
  user_id: string
  name: string
  isin: string
  created_at: string
}

export async function getDepots(): Promise<Depot[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('depots')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (data ?? []) as Depot[]
}

export async function createDepot(
  name: string,
  isin: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  if (!name.trim()) return { success: false, error: 'Name ist erforderlich' }
  if (!isin.trim()) return { success: false, error: 'ISIN ist erforderlich' }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('depots')
      .insert({ user_id: user.id, name: name.trim(), isin: isin.trim().toUpperCase() })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, id: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function deleteDepot(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('depots')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

// ─── Summary (for accounts page & dashboard) ──────────────────────────────────

export type DepotWithSummary = Depot & DepotSummary

export async function getDepotsSummaries(): Promise<DepotWithSummary[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

  const depots = await getDepots()
  if (!depots.length) return []

  const isins = depots.map(d => d.isin)

  const [{ data: transactions }, { data: caches }, { data: history }] = await Promise.all([
    supabase
      .from('depot_transactions')
      .select('isin, amount_eur, shares')
      .eq('user_id', user.id)
      .in('isin', isins),
    supabase
      .from('fund_price_cache')
      .select('isin, price')
      .in('isin', isins),
    // Rückfallebene, wenn der Cache leer ist. Ohne sie stand depotValue auf null
    // und das Dashboard zeigte 0 € Depot, während fn_take_snapshot über
    // fn_fund_price_eur den letzten bekannten Kurs nimmt — die Kachel und die
    // Verlaufskurve wären damit sofort wieder auseinandergelaufen.
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
