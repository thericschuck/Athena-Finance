'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { getValuations } from '@/lib/data/inventar'
import type { Valuation } from '@/lib/valuables'

/** Bewertungs-Historie eines Stücks (älteste zuerst) für den Wertverlauf. */
export async function loadValuations(
  valuableId: string,
): Promise<{ error: string } | { valuations: Valuation[] }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  if (!/^[0-9a-f-]{36}$/i.test(valuableId)) return { error: 'Ungültige ID' }
  return { valuations: await getValuations(supabase, user.id, valuableId) }
}
