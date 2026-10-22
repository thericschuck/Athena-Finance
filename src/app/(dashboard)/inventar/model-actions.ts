'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/supabase/server'
import { schaetzeWertverlauf } from '@/lib/data/wertverlauf'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

/**
 * Schätzt den Wertverlauf nach Kategorie und Nutzung — für ein Stück oder die ganze
 * Sammlung (ohne Id). Handeingaben werden nie angetastet, siehe lib/data/wertverlauf.ts.
 */
export async function schaetzeVerlauf(
  valuableId?: string,
): Promise<{ error: string } | { verarbeitet: number; punkte: number }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  if (valuableId !== undefined) {
    const p = parseInput(uuid, valuableId)
    if (!p.ok) return { error: issueMessage(p) }
  }

  const res = await schaetzeWertverlauf(supabase, user.id, valuableId)
  if ('error' in res) return res
  revalidatePath('/inventar')
  return { verarbeitet: res.verarbeitet, punkte: res.punkte }
}
