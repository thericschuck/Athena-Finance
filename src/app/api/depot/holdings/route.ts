import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'

/**
 * GET /api/depot/holdings
 * Returns the last-synced securities depot positions (e.g. a Union Investment
 * "UnionDepot") for the authenticated user. Read-only — the sync itself happens
 * as part of /api/bank/sync (same FinTS dialog, same login), which upserts here.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const { data, error } = await supabase
    .from('depot_holdings')
    .select('*')
    .eq('user_id', user.id)
    .order('isin')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holdings: data ?? [] })
}
