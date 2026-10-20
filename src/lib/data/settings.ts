import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Datenzugriff für Profil und Einstellungen. Reine Funktionen: Client und userId
 * kommen vom Aufrufer. src/lib/settings.ts (getProfile/getSettings) delegiert hierher.
 */

type Client = SupabaseClient<Database>

export type UserProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  currency: string
}

export type SettingsMap = Record<string, unknown>

export async function fetchProfile(supabase: Client, userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, timezone, currency')
    .eq('id', userId)
    .single()
  return data ?? null
}

/** Alle Einstellungen des Users als key → value (klein: eine Zeile je Schlüssel). */
export async function fetchSettings(supabase: Client, userId: string): Promise<SettingsMap> {
  const { data } = await supabase
    .from('user_settings')
    .select('key, value')
    .eq('user_id', userId)
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
}

/** Ein einzelner Einstellungswert (`null`, wenn der Schlüssel nicht existiert). */
export async function fetchSettingValue(supabase: Client, userId: string, key: string): Promise<unknown> {
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? null
}
