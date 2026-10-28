/**
 * Haushalts-Peers fuer Service-Role-Pfade (Cron), wo es keinen RLS-Kontext und keinen `resolveScope` gibt.
 * Reine Regeln getrennt vom Laden, damit sie testbar sind.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type MitgliedsZeile = { household_id: string; user_id: string; joined_at?: string | null }

/**
 * IDs aller Mitglieder des Haushalts von `userId` (inkl. `userId`, in Beitrittsreihenfolge).
 * Ohne Haushalt: nur `[userId]` (Ein-Personen-Fall, Verhalten wie vor dem Haushalt).
 */
export function peerIdsAusZeilen(zeilen: MitgliedsZeile[], userId: string): string[] {
  const eigene = zeilen.find(z => z.user_id === userId)
  if (!eigene) return [userId]
  const ids = zeilen
    .filter(z => z.household_id === eigene.household_id)
    .sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? ''))
    .map(z => z.user_id)
  return [...new Set([userId, ...ids])]
}

/**
 * Gruppiert Nutzer nach Haushalt (Nutzer ohne Haushalt sind je eine eigene Gruppe). Die Reihenfolge der Eingabe bleibt
 * erhalten; so laeuft Arbeit, die pro Haushalt nur einmal passieren soll, genau fuer das erste Mitglied.
 */
export function gruppiereNachHaushalt(userIds: string[], zeilen: MitgliedsZeile[]): string[][] {
  const haushaltVon = new Map(zeilen.map(z => [z.user_id, z.household_id]))
  const gruppen = new Map<string, string[]>()
  for (const id of userIds) {
    const key = haushaltVon.get(id) ?? `solo:${id}`
    gruppen.set(key, [...(gruppen.get(key) ?? []), id])
  }
  return [...gruppen.values()]
}

export async function ladeMitgliedsZeilen(supabase: SupabaseClient<Database>): Promise<MitgliedsZeile[]> {
  const { data, error } = await supabase.from('household_members').select('household_id, user_id, joined_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function ladePeerIds(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
  return peerIdsAusZeilen(await ladeMitgliedsZeilen(supabase), userId)
}
