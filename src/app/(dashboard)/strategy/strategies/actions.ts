'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText, optDate, optUuid, optIntField, optMoneyField, boolTrue } from '@/lib/api/schemas'

export type StrategyActionState = { error: string } | { success: true } | null

const REVALIDATE_LIST   = ()         => revalidatePath('/strategy/strategies')
const REVALIDATE_DETAIL = (id: string) => revalidatePath(`/strategy/strategies/${id}`)

// Leer, 0 oder nicht numerisch → Standardwert (wie bisher `parseInt(x) || default`).
const intOr = (fallback: number, msg: string) =>
  optIntField(msg).transform(v => v || fallback)
const moneyOr = (fallback: number, msg: string) =>
  optMoneyField(msg).transform(v => v || fallback)

const strategyFields = {
  name: reqText('Name ist erforderlich', 200),
  asset: reqText('Asset ist erforderlich', 100),
  timeframe: reqText('Timeframe ist erforderlich', 20),
  asset_class: z.string().max(50).optional().transform(v => v || 'major'),
  status: z.string().max(30).optional().transform(v => v || 'development'),
  pine_version: intOr(5, 'Pine-Version ist ungültig'),
  version: intOr(1, 'Version ist ungültig'),
  initial_capital: moneyOr(10000, 'Startkapital ist ungültig'),
  process_on_close: boolTrue,
  combo_id: optUuid('Combo-ID ist ungültig'),
  tv_script_url: optText(2000),
  submission_date: optDate,
  notes: optText(5000),
}
const createStrategySchema = z.object(strategyFields)
const updateStrategySchema = z.object({ id: idField(), ...strategyFields })

// Spalten von submission_checklist (src/types/database.ts)
const CHECKLIST_FIELDS = [
  'equity_screenshot', 'indicator_desc', 'inputs_screenshot', 'repaint_tested',
  'robustness_sheet', 'stats_screenshot', 'tv_script_url',
] as const

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createStrategy(
  _prev: StrategyActionState,
  formData: FormData
): Promise<StrategyActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createStrategySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }

  const { error } = await supabase.from('strategies').insert({
    ...parsed.data,
    user_id: user.id,
  })

  if (error) return { error: error.message }
  REVALIDATE_LIST()
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateStrategy(
  _prev: StrategyActionState,
  formData: FormData
): Promise<StrategyActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateStrategySchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from('strategies')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE_LIST()
  REVALIDATE_DETAIL(id)
  return { success: true }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteStrategy(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('strategies')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE_LIST()
  return {}
}

// ─── Checklist toggle ─────────────────────────────────────────────────────────
export async function toggleChecklistItem(
  strategyId: string,
  field: string,
  value: boolean
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ strategyId: uuid, field: z.enum(CHECKLIST_FIELDS), value: z.boolean() }),
    { strategyId, field, value },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { error } = await supabase
    .from('submission_checklist')
    .upsert(
      { strategy_id: strategyId, [field]: value, updated_at: new Date().toISOString() },
      { onConflict: 'strategy_id' }
    )

  if (error) return { error: error.message }
  REVALIDATE_DETAIL(strategyId)
  return {}
}
