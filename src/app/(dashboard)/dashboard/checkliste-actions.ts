'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { fetchSettingValue } from '@/lib/data/settings'
import { ladeErsteSchritteZaehler } from '@/lib/data/erste-schritte'
import { CHECKLISTE_KEY, checklisteFlag, sollFertigVermerken, type ChecklisteFlag } from '@/lib/leer/erste-schritte'

type Ergebnis = { error: string } | { success: true }

/**
 * Vermerk der Checkliste "Erste Schritte" (user_settings, owner-only: user_id kommt aus der Session, die RLS
 * erlaubt nur die eigene Zeile). Keine Eingabe vom Client ausser dem Aufruf selbst.
 */
async function schreibeFlag(wert: ChecklisteFlag | null): Promise<Ergebnis> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const { error } = wert
    ? await supabase.from('user_settings').upsert({ user_id: user.id, key: CHECKLISTE_KEY, value: wert }, { onConflict: 'user_id,key' })
    : await supabase.from('user_settings').delete().eq('user_id', user.id).eq('key', CHECKLISTE_KEY)
  if (error) return { error: 'Konnte nicht gespeichert werden.' }
  revalidatePath('/dashboard')
  revalidatePath('/settings')
  return { success: true }
}

export async function blendeChecklisteAus(): Promise<Ergebnis> {
  return schreibeFlag('ausgeblendet')
}

/** Zeigt die Checkliste wieder (Einstellungen -> Darstellung). Loescht den Vermerk, die Schritte rechnen sich neu. */
export async function zeigeChecklisteWieder(): Promise<Ergebnis> {
  return schreibeFlag(null)
}

/**
 * Vermerkt 'fertig'. Wird vom Client nach dem Rendern angestossen (siehe ChecklisteFertigVermerk), weil
 * `after()` in Server Components weder cookies() noch die Session nutzen darf. Dem Client wird NICHT geglaubt:
 * hier wird im Scope 'ich' neu gezaehlt und nur bei echter Vollstaendigkeit geschrieben.
 */
export async function vermerkeChecklisteFertig(): Promise<Ergebnis> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const aktuell = checklisteFlag(await fetchSettingValue(supabase, user.id, CHECKLISTE_KEY))
  if (aktuell) return { success: true }
  const ctx = await resolveScope(supabase, user, 'ich')
  const zaehler = await ladeErsteSchritteZaehler(supabase, ctx)
  if (!sollFertigVermerken(zaehler, ctx.scope, aktuell)) return { error: 'Noch nicht alle Schritte erledigt.' }
  return schreibeFlag('fertig')
}
