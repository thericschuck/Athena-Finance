import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildScopeContext, parseScope, type ScopeContext } from './scope'
import { SCOPE_COOKIE } from './cookie'

type DB = SupabaseClient<Database>

/**
 * Nur serverseitig verwenden (cookies() aus next/headers).
 * Pro Request und pro (Client, Nutzer, requested) memoisiert; `getAuthUser()` liefert denselben Client.
 */
const load = cache(async (supabase: DB, userId: string, requested: string | null): Promise<ScopeContext> => {
  const { data: memberRows } = await supabase
    .from('household_members')
    .select('household_id, user_id, role, joined_at')
    .order('joined_at', { ascending: true })

  // Haushalt des Nutzers; die RLS zeigt ohnehin nur Mitgliedschaften des eigenen Haushalts.
  const rows = memberRows ?? []
  const householdId = rows.find(m => m.user_id === userId)?.household_id ?? null
  const peers = householdId ? rows.filter(m => m.household_id === householdId) : []

  const [profilesRes, accountsRes] = await Promise.all([
    peers.length
      ? supabase.from('user_profiles').select('id, display_name').in('id', peers.map(p => p.user_id))
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    supabase.from('accounts').select('id, user_id, shared, bank_iban'),
  ])
  const names = new Map((profilesRes.data ?? []).map(p => [p.id, p.display_name]))

  return buildScopeContext({
    userId,
    requested,
    householdId,
    members: peers.map(p => ({
      id: p.user_id,
      name: names.get(p.user_id) ?? null,
      role: p.role,
      joinedAt: p.joined_at,
    })),
    accounts: accountsRes.data ?? [],
  })
})

/**
 * Loest den Scope des Nutzers auf. Reihenfolge: explizit uebergebener Wert (z. B. `searchParams.scope`)
 * vor Cookie `athena_scope` vor Standard 'ich'. Unbekannte/unverfuegbare Werte fallen auf 'ich' zurueck.
 */
export async function resolveScope(
  supabase: DB,
  user: { id: string },
  requested?: string | string[] | null,
): Promise<ScopeContext> {
  let name = parseScope(Array.isArray(requested) ? requested[0] : requested)
  if (!name) {
    const store = await cookies()
    name = parseScope(store.get(SCOPE_COOKIE)?.value)
  }
  return load(supabase, user.id, name)
}
