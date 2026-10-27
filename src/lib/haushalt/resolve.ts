import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildScopeContext, parseScope, type ScopeContext } from './scope'
import { SCOPE_COOKIE } from './cookie'

type DB = SupabaseClient<Database>

export type ScopeProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  currency: string
}

/**
 * Rohdaten fuer Scope UND Layout, in EINER Rundreise-Stufe: Mitgliedschaften, sichtbare Profile und Konten sind voneinander
 * unabhaengig und laufen parallel (frueher: Mitglieder -> dann Profile + Konten, also zwei Stufen, und das Layout holte das eigene
 * Profil noch einmal separat).
 *
 * Profile: die RLS (own_profile + household_user_profiles_select) liefert nur das eigene und die Profile der Haushaltsmitglieder;
 * der Filter auf die Mitglieder passiert danach in `load`, das Ergebnis ist also identisch zu `.in('id', mitglieder)`.
 *
 * Pro Request und pro (Client, Nutzer) memoisiert; `getAuthUser()` liefert denselben Client.
 */
const loadRaw = cache(async (supabase: DB, userId: string) => {
  const [memberRes, profilesRes, accountsRes] = await Promise.all([
    supabase
      .from('household_members')
      .select('household_id, user_id, role, joined_at')
      .order('joined_at', { ascending: true }),
    supabase.from('user_profiles').select('id, display_name, avatar_url, timezone, currency'),
    supabase.from('accounts').select('id, user_id, shared, bank_iban'),
  ])
  return {
    userId,
    memberRows: memberRes.data ?? [],
    profiles: (profilesRes.data ?? []) as ScopeProfile[],
    accounts: accountsRes.data ?? [],
  }
})

/** Eigenes Profil (fuer das Layout), aus derselben Abfrage wie der Scope. `null`, wenn keine Zeile existiert. */
export async function getOwnProfile(supabase: DB, userId: string): Promise<ScopeProfile | null> {
  const raw = await loadRaw(supabase, userId)
  return raw.profiles.find(p => p.id === userId) ?? null
}

const load = cache(async (supabase: DB, userId: string, requested: string | null): Promise<ScopeContext> => {
  const raw = await loadRaw(supabase, userId)
  // Haushalt des Nutzers; die RLS zeigt ohnehin nur Mitgliedschaften des eigenen Haushalts.
  const rows = raw.memberRows
  const householdId = rows.find(m => m.user_id === userId)?.household_id ?? null
  const peers = householdId ? rows.filter(m => m.household_id === householdId) : []
  const names = new Map(raw.profiles.map(p => [p.id, p.display_name]))

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
    accounts: raw.accounts,
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
