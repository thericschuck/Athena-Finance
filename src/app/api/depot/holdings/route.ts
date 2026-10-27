import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { applyOwnerScope } from '@/lib/haushalt/scope'

/**
 * GET /api/depot/holdings
 * Returns the last-synced securities depot positions (e.g. a Union Investment
 * "UnionDepot") for the authenticated user. Read-only — the sync itself happens
 * as part of /api/bank/sync (same FinTS dialog, same login), which upserts here.
 */
export async function GET() {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const ctx = await resolveScope(supabase, user)
  const { data, error } = await applyOwnerScope(supabase.from('depot_holdings').select('*'), ctx)
    .order('isin')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holdings: data ?? [] })
}
