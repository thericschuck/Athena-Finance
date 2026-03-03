'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type StrategyActionState = { error: string } | { success: true } | null

const REVALIDATE_LIST   = ()         => revalidatePath('/strategy/strategies')
const REVALIDATE_DETAIL = (id: string) => revalidatePath(`/strategy/strategies/${id}`)

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createStrategy(
  _prev: StrategyActionState,
  formData: FormData
): Promise<StrategyActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const name      = (formData.get('name') as string)?.trim()
  const asset     = (formData.get('asset') as string)?.trim()
  const timeframe = (formData.get('timeframe') as string)?.trim()

  if (!name)      return { error: 'Name ist erforderlich' }
  if (!asset)     return { error: 'Asset ist erforderlich' }
  if (!timeframe) return { error: 'Timeframe ist erforderlich' }

  const { error } = await supabase.from('strategies').insert({
    name,
    asset,
    asset_class:      (formData.get('asset_class') as string)  || 'major',
    status:           (formData.get('status') as string)        || 'development',
    timeframe,
    pine_version:     parseInt(formData.get('pine_version') as string)     || 5,
    version:          parseInt(formData.get('version') as string)           || 1,
    initial_capital:  parseFloat(formData.get('initial_capital') as string) || 10000,
    process_on_close: formData.get('process_on_close') === 'true',
    combo_id:         (formData.get('combo_id') as string)      || null,
    tv_script_url:    (formData.get('tv_script_url') as string) || null,
    submission_date:  (formData.get('submission_date') as string) || null,
    notes:            (formData.get('notes') as string)          || null,
    user_id:          user.id,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const id        = formData.get('id') as string
  const name      = (formData.get('name') as string)?.trim()
  const asset     = (formData.get('asset') as string)?.trim()
  const timeframe = (formData.get('timeframe') as string)?.trim()

  if (!id)        return { error: 'ID fehlt' }
  if (!name)      return { error: 'Name ist erforderlich' }
  if (!asset)     return { error: 'Asset ist erforderlich' }
  if (!timeframe) return { error: 'Timeframe ist erforderlich' }

  const { error } = await supabase
    .from('strategies')
    .update({
      name,
      asset,
      asset_class:      (formData.get('asset_class') as string)  || 'major',
      status:           (formData.get('status') as string)        || 'development',
      timeframe,
      pine_version:     parseInt(formData.get('pine_version') as string)     || 5,
      version:          parseInt(formData.get('version') as string)           || 1,
      initial_capital:  parseFloat(formData.get('initial_capital') as string) || 10000,
      process_on_close: formData.get('process_on_close') === 'true',
      combo_id:         (formData.get('combo_id') as string)      || null,
      tv_script_url:    (formData.get('tv_script_url') as string) || null,
      submission_date:  (formData.get('submission_date') as string) || null,
      notes:            (formData.get('notes') as string)          || null,
      updated_at:       new Date().toISOString(),
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

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
