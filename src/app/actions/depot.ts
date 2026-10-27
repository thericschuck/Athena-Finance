'use server'

import { createClient, getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { z } from 'zod'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid, isoDate, money } from '@/lib/api/schemas'
import {
  getDepots as loadDepots,
  getDepotTransactions as loadDepotTransactions,
  getDepotsSummaries as loadDepotsSummaries,
  getPortfolioHistory as loadPortfolioHistory,
  getSavingsPlan,
  getSavingsPlans as loadSavingsPlans,
  hasInitialTransaction,
  isDepotShared,
  resolveDepotOwner,
  type Depot,
  type DepotTransaction,
  type DepotSummary,
  type DepotWithSummary,
  type PortfolioHistoryPoint,
  type SavingsPlan,
} from '@/lib/data/depot'
import { requireRows } from '@/lib/data/mutation'

export type { Depot, DepotTransaction, DepotSummary, DepotWithSummary, PortfolioHistoryPoint, SavingsPlan }

// ─── Eingabe-Schemas ──────────────────────────────────────────────────────────

const isinField = z.string().trim().min(1, 'ISIN ist erforderlich').max(32)
const nameField = z.string().max(200)
const positive = (msg: string) => money.refine(n => n > 0, msg)

const initialHoldingSchema = z.object({
  isin: isinField,
  fundName: nameField,
  shares: positive('Anteile müssen größer als 0 sein'),
  pricePerShare: positive('Kurs muss größer als 0 sein'),
  date: isoDate,
})
const manualDepositSchema = z.object({
  isin: isinField,
  fundName: nameField,
  amountEur: positive('Betrag muss größer als 0 sein'),
  pricePerShare: positive('Kurs muss größer als 0 sein'),
  date: isoDate,
  notes: z.string().max(2000).optional(),
})
const savingsPlanSchema = z.object({
  isin: isinField,
  fundName: nameField,
  monthlyAmount: positive('Betrag muss größer als 0 sein'),
  executionDay: z.number().int().min(1, 'Ausführungstag muss zwischen 1 und 28 liegen').max(28, 'Ausführungstag muss zwischen 1 und 28 liegen'),
  startDate: isoDate,
})

const invalid = (r: { error: string; issues: { message: string }[] }) => ({
  success: false as const,
  error: issueMessage(r as Parameters<typeof issueMessage>[0]),
})

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  const args = parseInput(initialHoldingSchema, { isin, fundName, shares, pricePerShare, date })
  if (!args.ok) return invalid(args)

  try {
    // Check: initial darf nur einmal pro ISIN existieren
    const ctx = await resolveScope(supabase, user)
    if (await hasInitialTransaction(supabase, ctx, isin)) {
      return { success: false, error: 'Bestand wurde bereits eingetragen' }
    }

    const amount_eur = shares * pricePerShare

    await upsertFundPrice(supabase, isin, fundName, pricePerShare, date)
    const { error } = await supabase.from('depot_transactions').insert({
      // Transaktionen gehoeren dem Besitzer des (sichtbaren) Depots, sonst dem Handelnden.
      user_id: await resolveDepotOwner(supabase, ctx, isin),
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

  const args = parseInput(manualDepositSchema, { isin, fundName, amountEur, pricePerShare, date, notes })
  if (!args.ok) return invalid(args)

  try {
    const ctx = await resolveScope(supabase, user)
    await upsertFundPrice(supabase, isin, fundName, pricePerShare, date)
    const { error } = await supabase.from('depot_transactions').insert({
      user_id: await resolveDepotOwner(supabase, ctx, isin),
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
  if (!parseInput(isinField, isin).ok) return []
  return loadDepotTransactions(supabase, await resolveScope(supabase, user), isin)
}

export async function getPortfolioHistory(isin: string): Promise<PortfolioHistoryPoint[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []
  if (!parseInput(isinField, isin).ok) return []
  return loadPortfolioHistory(supabase, await resolveScope(supabase, user), isin)
}

export async function deleteDepotTransaction(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return invalid(idP)

  try {
    const { error } = await requireRows(supabase
      .from('depot_transactions')
      .delete()
      .eq('id', id)) // Haushaltstabelle: Zugriff regelt die RLS (Peers duerfen loeschen)
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

  const args = parseInput(savingsPlanSchema, { isin, fundName, monthlyAmount, executionDay, startDate })
  if (!args.ok) return invalid(args)

  try {
    const ctx = await resolveScope(supabase, user)
    const { error } = await supabase.from('savings_plans').insert({
      user_id: user.id, shared: await isDepotShared(supabase, ctx, isin), isin, fund_name: fundName, monthly_amount: monthlyAmount,
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
  return loadSavingsPlans(supabase, await resolveScope(supabase, user))
}

export async function toggleSavingsPlan(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }
  const args = parseInput(z.object({ id: uuid, isActive: z.boolean() }), { id, isActive })
  if (!args.ok) return invalid(args)

  try {
    const { error } = await requireRows(supabase
      .from('savings_plans')
      .update({ is_active: isActive })
      .eq('id', id)) // Haushaltstabelle: RLS
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function deleteSavingsPlan(id: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return invalid(idP)

  try {
    const { error } = await requireRows(supabase
      .from('savings_plans')
      .delete()
      .eq('id', id)) // Haushaltstabelle: RLS
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
  const args = parseInput(z.object({ planId: uuid, pricePerShare: positive('Kurs muss größer als 0 sein') }), { planId, pricePerShare })
  if (!args.ok) return invalid(args)

  try {
    const ctx = await resolveScope(supabase, user)
    const plan = await getSavingsPlan(supabase, ctx, planId)

    if (!plan) return { success: false, error: 'Sparplan nicht gefunden' }
    if (pricePerShare <= 0) return { success: false, error: 'Kurs muss größer als 0 sein' }

    const today = new Date().toISOString().split('T')[0]

    await upsertFundPrice(supabase, plan.isin, plan.fund_name, pricePerShare, today)

    const { error } = await supabase.from('depot_transactions').insert({
      user_id: await resolveDepotOwner(supabase, ctx, plan.isin),
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

export async function getDepots(): Promise<Depot[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []
  return loadDepots(supabase, await resolveScope(supabase, user))
}

export async function createDepot(
  name: string,
  isin: string,
  shared = false,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  const args = parseInput(
    z.object({ name: z.string().trim().min(1, 'Name ist erforderlich').max(200), isin: isinField }),
    { name, isin },
  )
  if (!args.ok) return invalid(args)

  try {
    const { data, error } = await supabase
      .from('depots')
      .insert({ user_id: user.id, name: name.trim(), isin: isin.trim().toUpperCase(), shared })
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
  const idP = parseInput(uuid, id)
  if (!idP.ok) return invalid(idP)

  try {
    const { error } = await requireRows(supabase
      .from('depots')
      .delete()
      .eq('id', id)) // Haushaltstabelle: RLS
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

/** Depot (und seine Sparplaene) mit dem Haushalt teilen bzw. wieder privat machen. */
export async function setDepotShared(id: string, shared: boolean): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }
  const args = parseInput(z.object({ id: uuid, shared: z.boolean() }), { id, shared })
  if (!args.ok) return invalid(args)

  const { data: depot, error } = await supabase.from('depots').update({ shared }).eq('id', id).select('user_id, isin').single()
  if (error) return { success: false, error: error.message }
  // Sparplaene zur ISIN des Depots folgen dem Flag.
  await supabase.from('savings_plans').update({ shared }).eq('user_id', depot.user_id).eq('isin', depot.isin)
  return { success: true }
}

// ─── Summary (for accounts page & dashboard) ──────────────────────────────────

export async function getDepotsSummaries(): Promise<DepotWithSummary[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []
  return loadDepotsSummaries(supabase, await resolveScope(supabase, user))
}
