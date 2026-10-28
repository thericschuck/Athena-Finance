import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyAccountScope, applyOwnerScope, type ScopeContext } from '@/lib/haushalt/scope'
import { herabstufungsIds, typFragment } from '@/lib/haushalt/umbuchung'
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
export async function ladeVertragsAbgleich(supabase: DB, ctx: ScopeContext, heute = heuteBerlin()): Promise<VertragMitAbgleich[]> {
  return abgleich(supabase, {
    vertraege: q => applyOwnerScope(q, ctx),
    buchungen: q => applyAccountScope(q, ctx),
    // Im Haushalt zaehlt auch eine Umbuchung ohne Gegenkonto im Scope als Ausgabe (effektive Richtung, lib/haushalt/umbuchung.ts).
    herab: herabstufungsIds(ctx),
  }, heute)
}

/**
 * OWNER-ONLY-Variante fuer Cron/Erinnerungen (Service-Role, kein Scope): strikt `user_id = userId` fuer Vertraege und
 * Buchungen, keine Haushaltsfilter, keine Herabstufung (nur `type = 'expense'`).
 */
export async function ladeVertragsAbgleichFuerNutzer(supabase: DB, userId: string, heute = heuteBerlin()): Promise<VertragMitAbgleich[]> {
  return abgleich(supabase, {
    vertraege: q => q.eq('user_id', userId),
    buchungen: q => q.eq('user_id', userId),
    herab: undefined,
  }, heute)
}

type VertragsQuery = ReturnType<typeof vertragsBasis>
function vertragsBasis(supabase: DB) {
  return supabase
    .from('contracts')
    .select('id, name, type, amount, frequency, billing_day, start_date, end_date, auto_renews, is_active, account_id')
}
type BuchungsQuery = ReturnType<typeof buchungsBasis>
function buchungsBasis(supabase: DB) {
  return supabase.from('unified_transactions').select('id, account_id, date, amount, type')
}

type Filter = {
  vertraege: (q: VertragsQuery) => VertragsQuery
  buchungen: (q: BuchungsQuery) => BuchungsQuery
  herab: string[] | undefined
}

async function abgleich(supabase: DB, filter: Filter, heute: string): Promise<VertragMitAbgleich[]> {
  const { data: vertraege, error } = await filter.vertraege(vertragsBasis(supabase))
    .eq('is_active', true).not('account_id', 'is', null)
  if (error) throw new Error(error.message)

  const liste: AbgleichVertrag[] = (vertraege ?? []).map(v => ({ ...v, auto_renews: v.auto_renews === true }))
  if (liste.length === 0) return []

  // Nur Ausgaben; mit `herab` (Haushalt mit Partner) zaehlen auch herabgestufte Umbuchungen, sonst bleibt es bei type = 'expense'.
  const herab = filter.herab
  const gescopt = filter.buchungen(buchungsBasis(supabase))
  const { data: rows, error: bError } = await (herab ? gescopt.or(typFragment(herab, 'expense')) : gescopt.eq('type', 'expense'))
    .in('account_id', [...new Set(liste.flatMap(v => (v.account_id ? [v.account_id] : [])))])
    .gte('date', addTage(heute, -(FENSTER_TAGE + TAGE_VOR)))
  if (bError) throw new Error(bError.message)

  const buchungen: AbgleichBuchung[] = (rows ?? []).flatMap(r =>
    r.id && r.date && r.amount !== null && r.type ? [{ id: r.id, account_id: r.account_id, date: r.date, amount: Number(r.amount), type: 'expense' }] : [])

  return liste.flatMap(vertrag => {
    const abgleich = pruefeVertrag(vertrag, buchungen, heute)
    return abgleich ? [{ vertrag, abgleich }] : []
  })
}
