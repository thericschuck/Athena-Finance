'use server'

import { createClient } from '@/lib/supabase/server'
import type { CoinEntry } from '@/lib/crypto/coin-registry'
import type { Json } from '@/types/database'

const CATALOG_KEY = 'coin_catalog'

// ─── Fetch user's custom coin catalog ─────────────────────────────────────────
export async function getCoinCatalog(): Promise<CoinEntry[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', CATALOG_KEY)
    .single()

  if (!data?.value) return []
  return data.value as unknown as CoinEntry[]
}

// ─── Add a coin to the catalog ────────────────────────────────────────────────
export async function addCoinToCatalog(entry: CoinEntry): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const existing = await getCoinCatalog()
  if (existing.find(c => c.symbol.toUpperCase() === entry.symbol.toUpperCase())) {
    return { error: `Symbol ${entry.symbol} existiert bereits im Katalog` }
  }

  const updated = [...existing, entry]
  const { error } = await supabase.from('user_settings').upsert(
    { user_id: user.id, key: CATALOG_KEY, value: updated as unknown as Json },
    { onConflict: 'user_id,key' }
  )

  if (error) return { error: error.message }
  return {}
}

// ─── Remove a coin from the catalog ──────────────────────────────────────────
export async function removeCoinFromCatalog(symbol: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const existing = await getCoinCatalog()
  const updated = existing.filter(c => c.symbol.toUpperCase() !== symbol.toUpperCase())

  const { error } = await supabase.from('user_settings').upsert(
    { user_id: user.id, key: CATALOG_KEY, value: updated as unknown as Json },
    { onConflict: 'user_id,key' }
  )

  if (error) return { error: error.message }
  return {}
}
