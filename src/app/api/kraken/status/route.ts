import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/encryption'
import { fetchKrakenBalances, krakenCodeToSymbol } from '@/lib/kraken'
import type { ExchangeKeyRow } from '@/types/exchange-keys'

// GET /api/kraken/portfolio
// Loads the user's Kraken key from Supabase (server-side decrypt), calls
// Kraken /0/private/Balance, and returns non-zero balances mapped to standard symbols.
// Returns { connected: false, balances: null } if no key is stored.
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // exchange_keys not yet in generated types — remove cast after `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: keyRow, error: keyError } = await (supabase as any)
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', user.id)
    .eq('exchange', 'kraken')
    .maybeSingle() as { data: Pick<ExchangeKeyRow, 'api_key' | 'api_secret'> | null; error: { message: string } | null }

  if (keyError) {
    return Response.json({ error: (keyError as { message: string }).message }, { status: 500 })
  }

  if (!keyRow) {
    return Response.json({ connected: false, balances: null })
  }

  let apiKey: string
  let apiSecret: string
  try {
    apiKey    = decrypt(keyRow.api_key)
    apiSecret = decrypt(keyRow.api_secret)
  } catch {
    return Response.json({ error: 'Failed to decrypt API credentials' }, { status: 500 })
  }

  let raw: Record<string, string>
  try {
    raw = await fetchKrakenBalances(apiKey, apiSecret)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 })
  }

  // Map to standard symbols and filter dust
  const balances: Record<string, string> = {}
  for (const [code, amount] of Object.entries(raw)) {
    if (parseFloat(amount) > 0.000001) {
      balances[krakenCodeToSymbol(code)] = amount
    }
  }

  return Response.json({ connected: true, balances })
}
