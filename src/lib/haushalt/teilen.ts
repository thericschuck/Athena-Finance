import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

/** Tabellen mit Spalte `shared`, die ueber das Formular-Schalter-Muster geteilt werden. */
export type TeilbareTabelle = 'accounts' | 'contracts' | 'debts' | 'savings_goals' | 'budget_categories'

/** Wahr, wenn der Haushalt des Nutzers mindestens ein weiteres Mitglied hat (sonst gibt es nichts zu teilen). */
export async function teilenErlaubt(supabase: DB): Promise<boolean> {
  const { data } = await supabase.from('household_members').select('user_id')
  return (data?.length ?? 0) > 1
}

/** Reiner Kern: Schalter im Formular vorhanden? Dann Wert (Haken gesetzt), sonst `undefined` (nicht anfassen). */
export function geteiltAusForm(formData: FormData): boolean | undefined {
  if (formData.get('shared_form') !== '1') return undefined
  const v = formData.get('shared')
  return v === 'on' || v === 'true' || v === '1'
}

/**
 * Setzt `shared` NACH dem Speichern, nur fuer eigene Zeilen (`user_id`) und nur, wenn der Nutzer Haushaltsmitglieder hat.
 * Entzug des Teilens (false) ist immer erlaubt. Ohne Schalter im Formular geschieht nichts. Fehler werden als Text
 * zurueckgegeben, nicht geworfen.
 */
export async function setzeGeteilt(
  supabase: DB,
  table: TeilbareTabelle,
  id: string,
  userId: string,
  formData: FormData,
): Promise<string | null> {
  const wunsch = geteiltAusForm(formData)
  if (wunsch === undefined) return null
  if (wunsch && !(await teilenErlaubt(supabase))) return null
  const { error } = await supabase.from(table).update({ shared: wunsch }).eq('id', id).eq('user_id', userId)
  return error ? error.message : null
}
