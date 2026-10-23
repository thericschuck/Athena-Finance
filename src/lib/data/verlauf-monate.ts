import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getMonthlyTotalsPage } from '@/lib/data/flows'
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
  userId: string,
): Promise<MonatRow[]> {
  const { rows } = await getMonthlyTotalsPage(supabase, userId, { from: 0, to: 998 })
  return rows
}
