import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type UserProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  currency: string
}

export type SettingsMap = Record<string, unknown>

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, timezone, currency')
    .eq('id', userId)
    .single()
  return data ?? null
}

export const getSettings = cache(async (userId: string): Promise<SettingsMap> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_settings')
    .select('key, value')
    .eq('user_id', userId)
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
})

export async function getSetting(userId: string, key: string): Promise<unknown> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single()
  return data?.value ?? null
}
