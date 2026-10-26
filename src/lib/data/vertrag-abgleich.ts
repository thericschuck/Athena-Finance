import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { addTage } from '@/lib/forecast/datum'
import {
  FENSTER_TAGE, TAGE_VOR, pruefeVertrag,
  type Abgleich, type AbgleichBuchung, type AbgleichVertrag,
} from '@/lib/forecast/vertrag-abgleich'

type DB = SupabaseClient<Database>

/** Heutiges Kalenderdatum in deutscher Ortszeit. */
export const heuteBerlin = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

export type VertragMitAbgleich = { vertrag: AbgleichVertrag; abgleich: Abgleich }

/**
 * Prüft jeden aktiven Vertrag gegen die Buchungen seines Kontos (Bank-Sync und manuelle Buchungen).
 * Liest nur; legt nie eine Buchung an. Verträge, die nicht prüfbar sind (ohne Konto, Umbuchung), fehlen im Ergebnis.
 */
export async function ladeVertragsAbgleich(supabase: DB, userId: string, heute = heuteBerlin()): Promise<VertragMitAbgleich[]> {
  const { data: vertraege, error } = await supabase
    .from('contracts')
    .select('id, name, type, amount, frequency, billing_day, start_date, end_date, auto_renews, is_active, account_id')
    .eq('user_id', userId).eq('is_active', true).not('account_id', 'is', null)
  if (error) throw new Error(error.message)

  const liste: AbgleichVertrag[] = (vertraege ?? []).map(v => ({ ...v, auto_renews: v.auto_renews === true }))
  if (liste.length === 0) return []

  const { data: rows, error: bError } = await supabase
    .from('unified_transactions')
    .select('id, account_id, date, amount, type')
    .eq('user_id', userId).eq('type', 'expense')
    .in('account_id', [...new Set(liste.flatMap(v => (v.account_id ? [v.account_id] : [])))])
    .gte('date', addTage(heute, -(FENSTER_TAGE + TAGE_VOR)))
  if (bError) throw new Error(bError.message)

  const buchungen: AbgleichBuchung[] = (rows ?? []).flatMap(r =>
    r.id && r.date && r.amount !== null && r.type ? [{ id: r.id, account_id: r.account_id, date: r.date, amount: Number(r.amount), type: r.type }] : [])

  return liste.flatMap(vertrag => {
    const abgleich = pruefeVertrag(vertrag, buchungen, heute)
    return abgleich ? [{ vertrag, abgleich }] : []
  })
}
