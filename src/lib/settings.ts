import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  fetchProfile, fetchSettings,
  type UserProfile, type SettingsMap,
} from '@/lib/data/settings'

export type { UserProfile, SettingsMap }

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await createClient()
  return fetchProfile(supabase, userId)
}

export const getSettings = cache(async (userId: string): Promise<SettingsMap> => {
  const supabase = await createClient()
  return fetchSettings(supabase, userId)
})
