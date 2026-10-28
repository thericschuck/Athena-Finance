import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildScopeContext, type ScopeContext, type ScopeName } from './scope'

/**
 * ScopeContext fuer einen bekannten Nutzer OHNE Cookie/Request (Cron, Review-Lauf). Gegenstueck zu `resolveScope`
 * (resolve.ts), das cookies() braucht.
 *
 * Funktioniert mit dem Cookie-Client (RLS) und mit dem Service-Role-Client. Beim Service-Role-Client gibt es keine RLS,
 * deshalb werden Mitglieder auf den Haushalt des Nutzers und Konten auf dessen Mitglieder begrenzt: sonst wuerden
 * fremde Haushalte (und deren `shared`-Konten) im Scope landen.
 */
export async function resolveScopeForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  requested: ScopeName = 'ich',
): Promise<ScopeContext> {
  const { data: alle } = await supabase
    .from('household_members')
    .select('household_id, user_id, role, joined_at')
    .order('joined_at', { ascending: true })
  const rows = alle ?? []
  const householdId = rows.find(m => m.user_id === userId)?.household_id ?? null
  const peers = householdId ? rows.filter(m => m.household_id === householdId) : []
  const memberIds = peers.length > 0 ? peers.map(p => p.user_id) : [userId]

  const [profiles, accounts] = await Promise.all([
    peers.length
      ? supabase.from('user_profiles').select('id, display_name').in('id', memberIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    supabase.from('accounts').select('id, user_id, shared, bank_iban').in('user_id', memberIds),
  ])
  const names = new Map((profiles.data ?? []).map(p => [p.id, p.display_name]))

  return buildScopeContext({
    userId,
    requested,
    householdId,
    members: peers.map(p => ({ id: p.user_id, name: names.get(p.user_id) ?? null, role: p.role, joinedAt: p.joined_at })),
    accounts: accounts.data ?? [],
  })
}
