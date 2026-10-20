'use server'

import { getAuthUser } from '@/lib/supabase/server'
import type { CoinEntry } from '@/lib/crypto/coin-registry'
import { getUserSettingValue } from '@/lib/data/crypto'
import type { Json } from '@/types/database'
import { z } from 'zod'
import { parseInput, issueMessage } from '@/lib/api/validate'

const coinEntrySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  coingecko_id: z.string().max(100).nullable(),
  type: z.enum(['crypto', 'stable', 'fiat']),
})

const CATALOG_KEY = 'coin_catalog'

// ─── Fetch user's custom coin catalog ─────────────────────────────────────────
export async function getCoinCatalog(): Promise<CoinEntry[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []

  const value = await getUserSettingValue(supabase, user.id, CATALOG_KEY)

  if (!value) return []
  return value as unknown as CoinEntry[]
}

// ─── Add a coin to the catalog ────────────────────────────────────────────────
export async function addCoinToCatalog(entry: CoinEntry): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const parsedEntry = parseInput(coinEntrySchema, entry)
  if (!parsedEntry.ok) return { error: issueMessage(parsedEntry) }
  entry = parsedEntry.data

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
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const symbolP = parseInput(z.string().min(1).max(20), symbol)
  if (!symbolP.ok) return { error: issueMessage(symbolP) }

  const existing = await getCoinCatalog()
  const updated = existing.filter(c => c.symbol.toUpperCase() !== symbol.toUpperCase())

  const { error } = await supabase.from('user_settings').upsert(
    { user_id: user.id, key: CATALOG_KEY, value: updated as unknown as Json },
    { onConflict: 'user_id,key' }
  )

  if (error) return { error: error.message }
  return {}
}
