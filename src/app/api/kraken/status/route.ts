import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/kraken/status?exchange=kraken|kraken_futures
// Used by the Settings → Integrationen page to show whether a key is stored for the given
// exchange — a plain existence check, not a live Kraken call. `exchange` defaults to 'kraken'
// (Spot) for backwards compatibility; pass 'kraken_futures' for the separate Futures key. The
// actual balance/price/cost-basis sync lives in `syncFromKraken()`
// (src/app/(dashboard)/crypto/actions.ts), triggered explicitly by the "Jetzt synchronisieren"
// button; this endpoint used to duplicate that work just to answer "connected?" on every
// settings-page mount, burning private-API rate limit for nothing.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const exchange = req.nextUrl.searchParams.get('exchange') ?? 'kraken'

  const { data: keyRow, error } = await supabase
    .from('exchange_keys')
    .select('id')
    .eq('user_id', user.id)
    .eq('exchange', exchange)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ connected: keyRow != null })
}
