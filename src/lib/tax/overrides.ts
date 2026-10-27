import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

/**
 * Steuerattribute pro PERSON (Haushalt: ein gemeinsamer Kategorienbaum, Steuerrolle/EUeR-Zeile/betrieblicher Anteil je Nutzer).
 * Quelle ist `category_tax_overrides` (owner-only per RLS); die Spalten `categories.tax_role/euer_zeile/business_share` sind
 * LEGACY (eingefroren, siehe supabase/migrations/20261030110000_tax_overrides_views.sql).
 *
 * SCHALTER `STEUER_OVERRIDES_LIVE` (Umgebungsvariable, Server):
 *   - nicht gesetzt / ungleich 'true' (Standard, solange die View-Migration 20261030110000 NICHT live ist):
 *       Lesen: Override des Nutzers, fehlt er, Rueckfall auf die Spalten von `categories`.
 *       Schreiben: Override UND (Doppelschreiben) die Spalten, damit die noch spaltenbasierten Views (category_tree,
 *       unified_transactions) Erics Aenderungen weiter sehen. Mit nur einem Nutzer sind beide Quellen identisch.
 *   - 'true' (nach Anwenden der Migration): Lesen nur aus Overrides (kein Rueckfall, fehlt er -> ungesetzt), Schreiben nur
 *       in Overrides, die Spalten bleiben unangetastet.
 * ENTFERNEN: Sobald die Migration live und der Schalter auf 'true' stabil laeuft, `rueckfallAufSpalten()` und den
 * Doppelschreib-Zweig in categories/actions.ts loeschen (Phase 5, zusammen mit dem Entfernen der Legacy-Spalten).
 */
export function rueckfallAufSpalten(): boolean {
  return process.env.STEUER_OVERRIDES_LIVE !== 'true'
}

export type SteuerWerte = {
  tax_role: string | null
  euer_zeile: number | null
  business_share: number | null
}

export type OverrideRow = SteuerWerte & { category_id: string }

type MitSteuerSpalten = { id: string; tax_role?: string | null; euer_zeile?: number | null; business_share?: number | null }

/**
 * Setzt die Steuerwerte der Kategorien auf die des Nutzers: Override vorhanden -> dessen drei Werte (auch NULL), sonst
 * mit Rueckfall die Spaltenwerte der Kategorie, ohne Rueckfall NULL. Reine Funktion, ohne Datenbankzugriff.
 */
export function mischeSteuerWerte<K extends MitSteuerSpalten>(
  kategorien: readonly K[],
  overrides: readonly OverrideRow[],
  rueckfall: boolean,
): (Omit<K, keyof SteuerWerte> & SteuerWerte)[] {
  const jeKategorie = new Map(overrides.map(o => [o.category_id, o]))
  return kategorien.map(k => {
    const o = jeKategorie.get(k.id)
    const werte: SteuerWerte = o
      ? {
          tax_role: o.tax_role ?? null,
          euer_zeile: o.euer_zeile ?? null,
          business_share: o.business_share === null || o.business_share === undefined ? null : Number(o.business_share),
        }
      : rueckfall
        ? {
            tax_role: k.tax_role ?? null,
            euer_zeile: k.euer_zeile ?? null,
            business_share: k.business_share === null || k.business_share === undefined ? null : Number(k.business_share),
          }
        : { tax_role: null, euer_zeile: null, business_share: null }
    return { ...k, ...werte }
  })
}

/** Overrides des Nutzers (RLS: owner-only, der Filter ist nur zur Klarheit). */
export async function ladeSteuerOverrides(supabase: DB, userId: string): Promise<OverrideRow[]> {
  const { data, error } = await supabase
    .from('category_tax_overrides')
    .select('category_id, tax_role, euer_zeile, business_share')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ ...r, business_share: r.business_share === null ? null : Number(r.business_share) }))
}

/** Kategorien mit den Steuerwerten des Nutzers (Override, ggf. Rueckfall auf die Spalten, siehe Schalter oben). */
export async function mitSteuerWerten<K extends MitSteuerSpalten>(
  supabase: DB,
  userId: string,
  kategorien: readonly K[],
): Promise<(Omit<K, keyof SteuerWerte> & SteuerWerte)[]> {
  const overrides = await ladeSteuerOverrides(supabase, userId)
  return mischeSteuerWerte(kategorien, overrides, rueckfallAufSpalten())
}

/**
 * Speichert die Steuerwerte des HANDELNDEN fuer eine Kategorie: alle drei NULL -> Override loeschen, sonst Upsert.
 * Solange der Schalter nicht 'true' ist, werden zusaetzlich die Legacy-Spalten geschrieben (Views lesen sie noch).
 */
export async function speichereSteuerOverride(
  supabase: DB,
  userId: string,
  categoryId: string,
  werte: SteuerWerte,
): Promise<{ error: string | null }> {
  const leer = werte.tax_role === null && werte.euer_zeile === null && werte.business_share === null
  if (leer) {
    const { error } = await supabase
      .from('category_tax_overrides')
      .delete()
      .eq('category_id', categoryId)
      .eq('user_id', userId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('category_tax_overrides')
      .upsert({ category_id: categoryId, user_id: userId, ...werte }, { onConflict: 'category_id,user_id' })
    if (error) return { error: error.message }
  }
  if (rueckfallAufSpalten()) {
    const { error } = await supabase.from('categories').update(werte).eq('id', categoryId)
    if (error) return { error: error.message }
  }
  return { error: null }
}
