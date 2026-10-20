'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optDate, optMoneyField, boolTrue } from '@/lib/api/schemas'

export type IndicatorActionState = { error: string } | { success: true } | null
export type PerfActionState      = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/strategy/indicators')

const indicatorFields = {
  name: reqText('Name ist erforderlich', 200),
  author: reqText('Author ist erforderlich', 200),
  type: reqText('Typ ist erforderlich', 100),
  subtype: optText(100),
  repaints: boolTrue,
  is_forbidden: boolTrue,
  forbidden_reason: optText(1000),
  tv_url: optText(2000),
  notes: optText(5000),
  code: optText(100000),
}
const createIndicatorSchema = z.object(indicatorFields)
const updateIndicatorSchema = z.object({ id: idField(), ...indicatorFields })

const perfNum = (label: string) => optMoneyField(label + ' ist ungültig')
const perfFields = {
  asset: reqText('Asset ist erforderlich', 100),
  asset_class: reqText('Asset-Klasse ist erforderlich', 50),
  timeframe: reqText('Timeframe ist erforderlich', 20),
  cobra_green: perfNum('Cobra Green'),
  cobra_red: perfNum('Cobra Red'),
  net_profit_pct: perfNum('Net Profit %'),
  profit_factor: perfNum('Profit Factor'),
  win_rate: perfNum('Win Rate'),
  trades: perfNum('Trades'),
  sharpe: perfNum('Sharpe'),
  sortino: perfNum('Sortino'),
  omega_ratio: perfNum('Omega Ratio'),
  equity_max_dd: perfNum('Equity Max DD'),
  intra_trade_dd: perfNum('Intra-Trade DD'),
  test_start: optDate,
  test_end: optDate,
  settings: optText(2000),
}
const createPerformanceSchema = z.object({
  indicator_id: idField('Indicator-ID fehlt', 'Indicator-ID ist ungültig'),
  ...perfFields,
})
const updatePerformanceSchema = z.object({ id: idField(), ...perfFields })

// ─── Indicators ───────────────────────────────────────────────────────────────
export async function createIndicator(
  _prev: IndicatorActionState,
  formData: FormData
): Promise<IndicatorActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createIndicatorSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('indicators').insert({
    ...parsed.data,
    user_id: user.id,
  })

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function updateIndicator(
  _prev: IndicatorActionState,
  formData: FormData
): Promise<IndicatorActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateIndicatorSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from('indicators')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function deleteIndicator(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('indicators')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}

// ─── Performance entries ──────────────────────────────────────────────────────
export async function createPerformance(
  _prev: PerfActionState,
  formData: FormData
): Promise<PerfActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createPerformanceSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('indicator_performance').insert(parsed.data)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function updatePerformance(
  _prev: PerfActionState,
  formData: FormData
): Promise<PerfActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updatePerformanceSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from('indicator_performance')
    .update(fields)
    .eq('id', id)

  if (error) return { error: error.message }
  REVALIDATE()
  return { success: true }
}

export async function deletePerformance(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('indicator_performance')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}
