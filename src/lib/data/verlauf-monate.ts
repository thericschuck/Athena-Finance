import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getMonthlyTotalsPage } from '@/lib/data/flows'
import { getMonthlyTotalsScope } from '@/lib/data/flows-scope'
import type { ScopeContext } from '@/lib/haushalt/scope'
import type { MonatRow } from '@/lib/verlauf/monate'

/**
 * Alle Monate aus `monthly_flow_totals`, jüngster zuerst.
 *
 * Die View hält nur rund 30 Monate. Statt serverseitig zu blättern wird deshalb alles
 * geladen und im Code gruppiert: Jahressummen, Vorjahresvergleich und Heatmap brauchen
 * ohnehin die Monate außerhalb der jeweiligen Seite. 999 liegt knapp unter PostgRESTs
 * stillem Deckel von 1.000 Zeilen.
 */
export async function getAllMonthlyTotals(
  supabase: SupabaseClient<Database>,
  who: ScopeContext | string,
): Promise<MonatRow[]> {
  // Haushalt mit Partner: monthly_flow_totals ist pro user_id, deshalb aus monthly_flows im Scope (flows-scope.ts).
  if (typeof who !== 'string') return getMonthlyTotalsScope(supabase, who)
  const userId = who
  const { rows } = await getMonthlyTotalsPage(supabase, userId, { from: 0, to: 998 })
  return rows
}
