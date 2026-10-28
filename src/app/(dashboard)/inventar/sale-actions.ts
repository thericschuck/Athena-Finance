'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid, isoDate, money } from '@/lib/api/schemas'
import { requireRows } from '@/lib/data/mutation'

// Verkauf eines Stücks. Eigene Datei neben actions.ts: dort gehört der Verkauf zum großen
// Bearbeiten-Formular, hier ist er ein einzelner Schritt mit zwei Feldern.
//
// Verkauft heisst nicht geloescht: Zeile und Wertverlauf bleiben, `is_active` geht auf false
// (raus aus Vitrine und Summe), `verkauft_am` sorgt dafuer, dass fn_valuables_total das Stueck
// an Stichtagen VOR dem Verkauf weiter mitzaehlt. Wie in updateValuable bleibt es bei
// '/inventar' -- das Dashboard rendert ohnehin dynamisch.

/** Markiert ein Stück als verkauft. `verkaufspreis` null = Preis unbekannt/verschenkt. */
export async function markValuableSold(
  id: string,
  verkauftAm: string,
  verkaufspreis: number | null,
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ id: uuid, verkauftAm: isoDate, verkaufspreis: money.nullable() }),
    { id, verkauftAm, verkaufspreis },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { error } = await requireRows(supabase
    .from('valuables')
    .update({
      verkauft_am: verkauftAm,
      verkaufspreis,
      is_active: false,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)) // Haushaltstabelle: RLS

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}

/** Macht einen Verkauf rückgängig: das Stück ist wieder in der Vitrine. */
export async function reopenValuable(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { error } = await requireRows(supabase
    .from('valuables')
    .update({
      verkauft_am: null,
      verkaufspreis: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)) // Haushaltstabelle: RLS

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}
