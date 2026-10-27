import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, type ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner } from '@/lib/data/scope-owner'
import type { ErsteSchritteZaehler } from '@/lib/leer/erste-schritte'

type DB = SupabaseClient<Database>

/**
 * Zaehlwerte fuer die „Ersten Schritte“ des Dashboards: nur Kopf-Abfragen (`head: true`, keine Zeilen),
 * alle im Scope der Seite. Athena-Chats sind OWNER-ONLY (nur eigene Gespraeche). Eine fehlgeschlagene
 * Abfrage zaehlt als 0 — im schlimmsten Fall sieht ein Nutzer mit Daten die Karte noch einmal,
 * nie eine kaputte Seite.
 */
export async function ladeErsteSchritteZaehler(supabase: DB, ctx: ScopeContext): Promise<ErsteSchritteZaehler> {
  const anzahl = async (p: PromiseLike<{ count: number | null }>): Promise<number> => {
    try { return (await p).count ?? 0 } catch { return 0 }
  }
  const kopf = { count: 'exact', head: true } as const

  const [buchungen, kategorien, vertraege, sparziele, athenaChats, depots, krypto, inventar, schulden] = await Promise.all([
    ctx.accountIds.length
      ? anzahl(applyAccountScope(supabase.from('unified_transactions').select('id', kopf), ctx))
      : Promise.resolve(0),
    anzahl(supabase.from('categories').select('id', kopf)),
    anzahl(scopedOwner(supabase.from('contracts').select('id', kopf), ctx)),
    anzahl(scopedOwner(supabase.from('savings_goals').select('id', kopf), ctx)),
    anzahl(supabase.from('ai_conversations').select('id', kopf).eq('user_id', ctx.userId)),
    anzahl(scopedOwner(supabase.from('depots').select('id', kopf), ctx)),
    anzahl(scopedOwner(supabase.from('assets').select('id', kopf), ctx)),
    anzahl(scopedOwner(supabase.from('valuables').select('id', kopf), ctx)),
    anzahl(scopedOwner(supabase.from('debts').select('id', kopf), ctx)),
  ])

  return {
    konten: ctx.accountIds.length,
    bankVerbunden: ctx.ibans.length > 0,
    buchungen,
    kategorien,
    vertraege,
    sparziele,
    athenaChats,
    anlagen: depots + krypto + inventar + schulden,
  }
}
