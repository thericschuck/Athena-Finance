'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/types/database'

export type SettingsState = { error: string } | { success: true } | null

const REVALIDATE = () => revalidatePath('/settings')

async function upsertSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  settings: Record<string, unknown>
) {
  const rows = Object.entries(settings).map(([key, value]) => ({
    user_id: userId,
    key,
    value: value as Json,
  }))
  return supabase
    .from('user_settings')
    .upsert(rows, { onConflict: 'user_id,key' })
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export async function saveProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  let avatarUrl = (formData.get('avatar_url') as string) || null

  // Handle file upload to Supabase Storage
  const file = formData.get('avatar_file') as File | null
  if (file && file.size > 0) {
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filePath = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true, contentType: file.type })

    if (uploadError) return { error: `Bild-Upload fehlgeschlagen: ${uploadError.message}` }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
    avatarUrl = publicUrl
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id:           user.id,
      display_name: (formData.get('display_name') as string) || null,
      avatar_url:   avatarUrl,
      timezone:     (formData.get('timezone') as string) || 'Europe/Berlin',
      currency:     (formData.get('currency') as string) || 'EUR',
      updated_at:   new Date().toISOString(),
    })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Appearance ───────────────────────────────────────────────────────────────
export async function saveAppearance(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await upsertSettings(supabase, user.id, {
    theme_preset:   (formData.get('theme_preset') as string) || null,
    theme:          formData.get('theme') as string || 'system',
    primary_color:  formData.get('primary_color') as string || '#00B4D8',
    compact_tables: formData.get('compact_tables') === 'true',
    number_format:  formData.get('number_format') as string || 'de-DE',
    date_format:    formData.get('date_format') as string || 'dd.MM.yyyy',
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Finance ──────────────────────────────────────────────────────────────────
export async function saveFinance(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const monthlyBudget = formData.get('monthly_budget') as string
  const taxRate       = formData.get('default_tax_rate') as string

  const { error } = await upsertSettings(supabase, user.id, {
    monthly_budget:   monthlyBudget ? parseFloat(monthlyBudget) : null,
    default_tax_rate: taxRate ? parseFloat(taxRate) : null,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}

// ─── Trading ──────────────────────────────────────────────────────────────────
export async function saveTrading(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const riskPct   = formData.get('risk_per_trade_pct') as string
  const maxTrades = formData.get('max_open_trades') as string

  const { error } = await upsertSettings(supabase, user.id, {
    default_asset_class: formData.get('default_asset_class') as string || 'major',
    default_timeframe:   (formData.get('default_timeframe') as string) || null,
    risk_per_trade_pct:  riskPct ? parseFloat(riskPct) : null,
    max_open_trades:     maxTrades ? parseInt(maxTrades) : null,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  REVALIDATE()
  return { success: true }
}
