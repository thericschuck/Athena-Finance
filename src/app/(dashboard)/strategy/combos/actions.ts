'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ComboActionState = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/strategy/combos')

type IndicatorRow = {
  indicator_id: string
  role: string
  settings_override: string | null
  sort_order: number
}

function parseIndicators(formData: FormData): IndicatorRow[] | null {
  const raw = formData.get('indicators_json') as string
  if (!raw) return []
  try {
    return JSON.parse(raw) as IndicatorRow[]
  } catch {
    return null
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createCombo(
  _prev: ComboActionState,
  formData: FormData
): Promise<ComboActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name        = (formData.get('name') as string)?.trim()
  const asset       = (formData.get('asset') as string)?.trim()
  const asset_class = (formData.get('asset_class') as string)?.trim()

  if (!name)        return { error: 'Name ist erforderlich' }
  if (!asset)       return { error: 'Asset ist erforderlich' }
  if (!asset_class) return { error: 'Asset-Klasse ist erforderlich' }

  const indicators = parseIndicators(formData)
  if (indicators === null) return { error: 'Ungültige Indikator-Daten' }

  const { data: combo, error } = await supabase
    .from('combos')
    .insert({
      name,
      asset,
      asset_class,
      status:          (formData.get('status') as string) || 'draft',
      long_condition:  (formData.get('long_condition') as string) || null,
      short_condition: (formData.get('short_condition') as string) || null,
      notes:           (formData.get('notes') as string) || null,
      indicator_count: indicators.length || null,
      user_id:         user.id,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id        = formData.get('id') as string
  const name      = (formData.get('name') as string)?.trim()
  const asset     = (formData.get('asset') as string)?.trim()
  const asset_class = (formData.get('asset_class') as string)?.trim()

  if (!id)          return { error: 'ID fehlt' }
  if (!name)        return { error: 'Name ist erforderlich' }
  if (!asset)       return { error: 'Asset ist erforderlich' }
  if (!asset_class) return { error: 'Asset-Klasse ist erforderlich' }

  const indicators = parseIndicators(formData)
  if (indicators === null) return { error: 'Ungültige Indikator-Daten' }

  const { error } = await supabase
    .from('combos')
    .update({
      name,
      asset,
      asset_class,
      status:          (formData.get('status') as string) || 'draft',
      long_condition:  (formData.get('long_condition') as string) || null,
      short_condition: (formData.get('short_condition') as string) || null,
      notes:           (formData.get('notes') as string) || null,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

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
