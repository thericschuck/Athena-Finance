'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, reqText, optText } from '@/lib/api/schemas'

export type ComboActionState = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/strategy/combos')

const indicatorRowSchema = z.object({
  indicator_id: uuid,
  role: z.string().min(1).max(50),
  settings_override: z.string().max(2000).nullable(),
  sort_order: z.number().int().min(0).max(1000),
})
type IndicatorRow = z.infer<typeof indicatorRowSchema>

const comboFields = {
  name: reqText('Name ist erforderlich', 200),
  asset: reqText('Asset ist erforderlich', 100),
  asset_class: reqText('Asset-Klasse ist erforderlich', 50),
  status: z.string().max(30).optional().transform(v => v || 'draft'),
  long_condition: optText(5000),
  short_condition: optText(5000),
  notes: optText(5000),
}
const createComboSchema = z.object(comboFields)
const updateComboSchema = z.object({ id: idField(), ...comboFields })

function parseIndicators(formData: FormData): IndicatorRow[] | null {
  const raw = formData.get('indicators_json') as string
  if (!raw) return []
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const res = parseInput(z.array(indicatorRowSchema).max(50), json)
  return res.ok ? res.data : null
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createCombo(
  _prev: ComboActionState,
  formData: FormData
): Promise<ComboActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createComboSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const c = parsed.data

  const indicators = parseIndicators(formData)
  if (indicators === null) return { error: 'Ungültige Indikator-Daten' }

  const { data: combo, error } = await supabase
    .from('combos')
    .insert({
      ...c,
      indicator_count: indicators.length || null,
      user_id:         user.id,
      passes_guard:    null,
      guard_failures:  null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  if (!combo) return { error: 'Combo konnte nicht erstellt werden' }

  if (indicators.length > 0) {
    const { error: ciErr } = await supabase
      .from('combo_indicators')
      .insert(indicators.map(row => ({ ...row, combo_id: combo.id })))
    if (ciErr) return { error: ciErr.message }
  }

  REVALIDATE()
  return { success: true }
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateCombo(
  _prev: ComboActionState,
  formData: FormData
): Promise<ComboActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateComboSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, ...c } = parsed.data

  const indicators = parseIndicators(formData)
  if (indicators === null) return { error: 'Ungültige Indikator-Daten' }

  const { error } = await supabase
    .from('combos')
    .update({
      ...c,
      indicator_count: indicators.length || null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Replace combo_indicators
  await supabase.from('combo_indicators').delete().eq('combo_id', id)
  if (indicators.length > 0) {
    const { error: ciErr } = await supabase
      .from('combo_indicators')
      .insert(indicators.map(row => ({ ...row, combo_id: id })))
    if (ciErr) return { error: ciErr.message }
  }

  REVALIDATE()
  return { success: true }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteCombo(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await supabase
    .from('combos')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}

// ─── Guard status ─────────────────────────────────────────────────────────────
export async function updateGuardStatus(
  id: string,
  passes: boolean,
  failures: string[]
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ id: uuid, passes: z.boolean(), failures: z.array(z.string().max(500)).max(100) }),
    { id, passes, failures },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { error } = await supabase
    .from('combos')
    .update({
      passes_guard:   passes,
      guard_failures: failures.length ? failures : null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  REVALIDATE()
  return {}
}
