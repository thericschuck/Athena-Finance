'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { signiereUrls } from '@/lib/assistant/datei-speicher'
import { ladeMentionOptionen } from '@/lib/assistant/mention-daten'
import type { MentionOption } from '@/lib/assistant/mentions'

/**
 * Server Actions für den Chat, die weder zu Sessions noch zu Projekten gehören:
 *  - Vorschau-URLs für Anhänge (in der Nachricht steht nur `storage:<pfad>`),
 *  - die Optionsliste der @-Auswahl (einmal beim ersten `@`, nicht bei jedem Tastendruck).
 */

/** Pfad -> signierte URL (eine Stunde gültig). Fremde Pfade und Fehler fehlen im Ergebnis. */
export async function signAthenaFileUrls(pfade: string[]): Promise<Record<string, string>> {
  const { supabase, user } = await getAuthUser()
  if (!user || !Array.isArray(pfade)) return {}
  return signiereUrls(
    supabase,
    user.id,
    pfade.filter((p): p is string => typeof p === 'string').slice(0, 50),
  )
}

export async function ladeMentionAuswahl(): Promise<MentionOption[]> {
  const { supabase, user } = await getAuthUser()
  if (!user) return []
  return ladeMentionOptionen(supabase, user.id)
}
