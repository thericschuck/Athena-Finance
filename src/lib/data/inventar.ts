import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Valuable, Valuation } from '@/lib/valuables'

/**
 * Datenzugriff Inventar. Reine Funktionen: Client und userId kommen vom Aufrufer.
 */
type DB = SupabaseClient<Database>

export type ValuableImageRow = {
  id: string
  valuable_id: string
  pfad: string
  art: string
  ist_hauptbild: boolean
  created_at: string
  hinweis: string | null
  prompt: string | null
  basis_bild_id: string | null
}

const VALUABLE_COLUMNS = [
  'id', 'user_id', 'name', 'kategorie', 'marke', 'modell', 'referenz', 'seriennummer',
  'gekauft_am', 'kaufpreis', 'kaufquelle', 'waehrung', 'zustand', 'box_vorhanden',
  'papiere_vorhanden', 'lagerort', 'versichert', 'versicherungsnummer', 'notizen',
  'im_vermoegen', 'verkauft_am', 'verkaufspreis', 'is_active', 'sort_order',
  'created_at', 'updated_at', 'aktueller_wert', 'wert_stand', 'wert_quelle',
  'rendite_prozent', 'hauptbild_pfad', 'bild_anzahl', 'foto_anzahl',
].join(', ')

/**
 * Aktive Inventar-Stücke inkl. aktuellem Wert (View `valuables_current`).
 * Unbegrenzt — die Summe der Sammlung läuft über alle Stücke.
 */
export async function getActiveValuables(supabase: DB, userId: string): Promise<Valuable[]> {
  const { data } = await supabase
    .from('valuables_current')
    .select(VALUABLE_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as Valuable[]
}

/**
 * Verkaufte Stücke (is_active = false MIT Verkaufsdatum), jüngster Verkauf zuerst.
 * getActiveValuables blendet sie aus; die View liefert sie trotzdem, weil sie nicht filtert.
 */
export async function getSoldValuables(supabase: DB, userId: string): Promise<Valuable[]> {
  const { data } = await supabase
    .from('valuables_current')
    .select(VALUABLE_COLUMNS)
    .eq('user_id', userId)
    .eq('is_active', false)
    .not('verkauft_am', 'is', null)
    .order('verkauft_am', { ascending: false })
  return (data ?? []) as unknown as Valuable[]
}

/**
 * Alle Bilder des Users. Hauptbild zuerst, danach das Neueste — dieselbe Reihenfolge wie
 * in der View, damit Galerie und angezeigtes Hauptbild nicht auseinanderlaufen.
 * Unbegrenzt (Kandidat für Paginierung bei großen Sammlungen).
 */
export async function getValuableImages(supabase: DB, userId: string): Promise<ValuableImageRow[]> {
  const { data } = await supabase
    .from('valuable_images')
    .select('id, valuable_id, pfad, art, ist_hauptbild, created_at, hinweis, prompt, basis_bild_id')
    .eq('user_id', userId)
    .order('ist_hauptbild', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as ValuableImageRow[]
}

/**
 * Bewertungs-Historie eines Stücks, älteste zuerst (für den Wertverlauf).
 * `user_id` wird zusätzlich zur RLS gefiltert, damit die Abfrage den Index nutzt und
 * auch mit einem Service-Client nie fremde Zeilen liefert.
 */
export async function getValuations(supabase: DB, userId: string, valuableId: string): Promise<Valuation[]> {
  const { data } = await supabase
    .from('valuable_valuations')
    .select('id, valuable_id, bewertet_am, wert, quelle, notiz')
    .eq('user_id', userId)
    .eq('valuable_id', valuableId)
    .order('bewertet_am', { ascending: true })
  return (data ?? []).map((r) => ({ ...r, wert: Number(r.wert) })) as Valuation[]
}
