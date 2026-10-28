import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Valuable, Valuation } from '@/lib/valuables'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner } from '@/lib/data/scope-owner'

/**
 * Datenzugriff Inventar. Reine Funktionen: Client und Scope kommen vom Aufrufer.
 * Haushaltssicht ueber `ScopeContext` (eigene ODER geteilte Stuecke). Die View `valuables_current` hat die Spalte `shared`
 * und wird direkt ueber `applyOwnerScope` gefiltert. Kindtabellen (Bilder, Bewertungen, Dokumente) haben kein `shared` und
 * werden ueber die Stueck-IDs aus `valuables` (`scopedValuableIds`) per valuable_id gefiltert.
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

/** IDs der Stuecke im Scope (Filter fuer die Kindtabellen ohne `shared`). */
async function scopedValuableIds(supabase: DB, ctx: ScopeContext): Promise<string[]> {
  const { data } = await scopedOwner(supabase.from('valuables').select('id'), ctx)
  return (data ?? []).map(r => r.id)
}

const VALUABLE_BASIS = [
  'id', 'user_id', 'name', 'kategorie', 'marke', 'modell', 'referenz', 'seriennummer',
  'gekauft_am', 'kaufpreis', 'kaufquelle', 'waehrung', 'zustand', 'box_vorhanden',
  'papiere_vorhanden', 'lagerort', 'versichert', 'versicherungsnummer', 'notizen',
  'im_vermoegen', 'verkauft_am', 'verkaufspreis', 'is_active', 'sort_order',
  'created_at', 'updated_at', 'aktueller_wert', 'wert_stand', 'wert_quelle',
  'rendite_prozent', 'hauptbild_pfad', 'bild_anzahl', 'foto_anzahl', 'nutzung', 'wertmodus', 'shared',
].join(', ')

/** Query auf `valuables_current` im Scope (eigene ODER geteilte Stuecke, direkt ueber `shared`). */
function viewQuery(supabase: DB, ctx: ScopeContext) {
  return scopedOwner(supabase.from('valuables_current').select(VALUABLE_BASIS), ctx)
}

/**
 * Aktive Inventar-Stücke inkl. aktuellem Wert (View `valuables_current`).
 * Unbegrenzt — die Summe der Sammlung läuft über alle Stücke.
 */
export async function getActiveValuables(supabase: DB, ctx: ScopeContext): Promise<Valuable[]> {
  const { data } = await viewQuery(supabase, ctx)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as Valuable[]
}

/**
 * Verkaufte Stücke (is_active = false MIT Verkaufsdatum), jüngster Verkauf zuerst.
 * getActiveValuables blendet sie aus; die View liefert sie trotzdem, weil sie nicht filtert.
 */
export async function getSoldValuables(supabase: DB, ctx: ScopeContext): Promise<Valuable[]> {
  const { data } = await viewQuery(supabase, ctx)
    .eq('is_active', false)
    .not('verkauft_am', 'is', null)
    .order('verkauft_am', { ascending: false })
  return (data ?? []) as unknown as Valuable[]
}

/**
 * Datum der letzten Handeingabe je Gegenstand (alle Bewertungen ausser `quelle = 'modell'`,
 * nicht in der Zukunft). Die View liefert nur den juengsten Stand, und der ist mit dem
 * Wertmodell fast immer „heute".
 */
export async function getHandBewertungsstaende(supabase: DB, ctx: ScopeContext): Promise<Map<string, string>> {
  const heute = new Date().toISOString().split('T')[0]
  const ids = await scopedValuableIds(supabase, ctx)
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('valuable_valuations').select('valuable_id, bewertet_am')
    .in('valuable_id', ids)
    .neq('quelle', 'modell')
    .lte('bewertet_am', heute)
  const stand = new Map<string, string>()
  for (const r of (data ?? []) as { valuable_id: string; bewertet_am: string }[]) {
    const bisher = stand.get(r.valuable_id)
    if (!bisher || r.bewertet_am > bisher) stand.set(r.valuable_id, r.bewertet_am)
  }
  return stand
}

/**
 * Rohdaten fuer den Sammlungsverlauf: ALLE Stuecke (auch verkaufte, sie zaehlen vor dem
 * Verkauf mit) und alle Bewertungen. Seitenweise gelesen, weil PostgREST pro Antwort nur
 * 1000 Zeilen liefert und das Wertmodell woechentlich einen Punkt je Stueck schreibt.
 */
export async function getSammlungsRohdaten(supabase: DB, ctx: ScopeContext) {
  const { data: stuecke } = await scopedOwner(
    supabase.from('valuables').select('id, shared, kategorie, im_vermoegen, kaufpreis, gekauft_am, verkauft_am'),
    ctx,
  )
  const ids = (stuecke ?? []).map(r => r.id)

  const bewertungen: { valuable_id: string; bewertet_am: string; wert: number }[] = []
  const SEITE = 1000
  for (let von = 0; ; von += SEITE) {
    if (ids.length === 0) break
    // Bewertungen der Stuecke im Scope (Kindtabelle ohne `shared`).
    const { data } = await supabase.from('valuable_valuations').select('valuable_id, bewertet_am, wert')
      .in('valuable_id', ids)
      .order('bewertet_am', { ascending: true })
      .order('valuable_id', { ascending: true })
      .range(von, von + SEITE - 1)
    const zeilen = (data ?? []) as { valuable_id: string; bewertet_am: string; wert: number }[]
    bewertungen.push(...zeilen)
    if (zeilen.length < SEITE) break
  }

  return {
    stuecke: (stuecke ?? []) as unknown as {
      id: string
      kategorie: string
      im_vermoegen: boolean
      kaufpreis: number | null
      gekauft_am: string | null
      verkauft_am: string | null
    }[],
    bewertungen,
  }
}

/**
 * Anzahl Dokumente je Gegenstand — für die Büroklammer auf der Kachel. Nur die Spalte
 * `valuable_id` wird gelesen, nicht die Zeilen mit Pfaden und Namen.
 * `database.ts` kennt die Tabelle noch nicht (Typen werden nicht von Hand gepflegt), daher
 * der Cast wie in document-actions.ts.
 */
export async function getDocumentCounts(supabase: DB, ctx: ScopeContext): Promise<Map<string, number>> {
  const ids = await scopedValuableIds(supabase, ctx)
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('valuable_documents' as never).select('valuable_id').in('valuable_id', ids)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as unknown as { valuable_id: string }[]) {
    counts.set(r.valuable_id, (counts.get(r.valuable_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Alle Bilder des Users. Hauptbild zuerst, danach das Neueste — dieselbe Reihenfolge wie
 * in der View, damit Galerie und angezeigtes Hauptbild nicht auseinanderlaufen.
 * Unbegrenzt (Kandidat für Paginierung bei großen Sammlungen).
 */
export async function getValuableImages(supabase: DB, ctx: ScopeContext): Promise<ValuableImageRow[]> {
  const ids = await scopedValuableIds(supabase, ctx)
  if (ids.length === 0) return []
  const { data } = await supabase
    .from('valuable_images')
    .select('id, valuable_id, pfad, art, ist_hauptbild, created_at, hinweis, prompt, basis_bild_id')
    .in('valuable_id', ids)
    .order('ist_hauptbild', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as ValuableImageRow[]
}

/**
 * Bewertungs-Historie eines Stücks, älteste zuerst (für den Wertverlauf). Zugriff regelt die RLS (auch Stücke eines Peers).
 */
export async function getValuations(supabase: DB, ctx: ScopeContext, valuableId: string): Promise<Valuation[]> {
  const { data } = await supabase
    .from('valuable_valuations')
    .select('id, valuable_id, bewertet_am, wert, quelle, notiz')
    .eq('valuable_id', valuableId)
    .order('bewertet_am', { ascending: true })
  return (data ?? []).map((r) => ({ ...r, wert: Number(r.wert) })) as Valuation[]
}
