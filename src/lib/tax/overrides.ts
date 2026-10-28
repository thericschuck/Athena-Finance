import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

/**
 * Steuerattribute pro PERSON (Haushalt: ein gemeinsamer Kategorienbaum, Steuerrolle/EUeR-Zeile/betrieblicher Anteil je Nutzer).
 * Einzige Quelle ist `category_tax_overrides` (owner-only per RLS). Lesen: Override des Nutzers, fehlt er, sind alle drei Werte
 * NULL (KEIN Rueckfall auf die Spalten von `categories`). Schreiben: nur in die Overrides.
 *
 * Die Spalten `categories.tax_role/euer_zeile/business_share` sind LEGACY und eingefroren (Migration 20261030110000, Overrides
 * backfilled, Drift 0). Sie bleiben bis zu einer eigenen spaeteren Migration in der Datenbank, der Code liest und schreibt
 * sie nicht mehr (Selects auf `categories` nennen sie nicht).
 */
export type SteuerWerte = {
  tax_role: string | null
  euer_zeile: number | null
  business_share: number | null
}

export type OverrideRow = SteuerWerte & { category_id: string }

type MitId = { id: string }

/**
 * Setzt die Steuerwerte der Kategorien auf die des Nutzers: Override vorhanden -> dessen drei Werte (auch NULL), sonst alle NULL.
 * Reine Funktion, ohne Datenbankzugriff. Ein Rueckfall auf Spaltenwerte der Kategorie existiert nicht mehr (und wird auch dann
 * nicht gemacht, wenn die Overrides leer sind).
 */
export function mischeSteuerWerte<K extends MitId>(
  kategorien: readonly K[],
  overrides: readonly OverrideRow[],
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

/** Kategorien mit den Steuerwerten des Nutzers (nur Overrides, siehe oben). */
export async function mitSteuerWerten<K extends MitId>(
  supabase: DB,
  userId: string,
  kategorien: readonly K[],
): Promise<(Omit<K, keyof SteuerWerte> & SteuerWerte)[]> {
  const overrides = await ladeSteuerOverrides(supabase, userId)
  return mischeSteuerWerte(kategorien, overrides)
}

/**
 * Speichert die Steuerwerte des HANDELNDEN fuer eine Kategorie: alle drei NULL -> Override loeschen, sonst Upsert.
 * Die Legacy-Spalten von `categories` werden nicht beschrieben.
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
  return { error: null }
}
