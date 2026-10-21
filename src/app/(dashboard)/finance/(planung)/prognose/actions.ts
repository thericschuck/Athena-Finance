'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/supabase/server'
import { ANNAHMEN_KEY, leseAnnahmen } from '@/lib/forecast/annahmen'
import type { Json } from '@/types/database'

export type AnnahmenState = { error?: string; success?: boolean } | null

/**
 * Speichert die Annahmen der Prognose als JSON in `user_settings`. Das Formular schickt die ganze
 * Liste als ein Feld; `leseAnnahmen` validiert sie wie beim Laden (ungültige Zeilen fallen heraus),
 * es wird also nie etwas gespeichert, was die Seite beim nächsten Laden nicht lesen könnte.
 */
export async function speichereAnnahmen(_prev: AnnahmenState, formData: FormData): Promise<AnnahmenState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const roh = formData.get('annahmen')
  if (typeof roh !== 'string') return { error: 'Keine Annahmen übermittelt' }
  let json: unknown
  try {
    json = JSON.parse(roh)
  } catch {
    return { error: 'Die Annahmen konnten nicht gelesen werden' }
  }

  const gueltig = leseAnnahmen(json)
  const verworfen = (Array.isArray(json) ? json.length : 0) - gueltig.length
  if (verworfen > 0) {
    return { error: `${verworfen} Zeile${verworfen === 1 ? ' ist' : 'n sind'} unvollständig (Name, Monat und Betrag sind Pflicht). Bitte korrigieren.` }
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, key: ANNAHMEN_KEY, value: gueltig as unknown as Json }, { onConflict: 'user_id,key' })
  if (error) return { error: error.message }

  revalidatePath('/finance/prognose')
  return { success: true }
}
