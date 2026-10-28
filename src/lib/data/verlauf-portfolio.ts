import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SnapshotZeile } from '@/lib/verlauf/portfolio'
import type { PortfolioSnapshotHistoryRow } from '@/lib/data/overview'

type DB = SupabaseClient<Database>

/**
 * Alle Snapshots ab `ab` (oder alle) — fuer Chart und Karten. PostgREST liefert hoechstens
 * 1000 Zeilen je Antwort und schneidet sonst STILL ab; bei taeglich mehreren Assets waere
 * der aelteste oder neueste Teil schnell weg. Daher seitenweise lesen, wie
 * getSammlungsRohdaten. Stabile Sortierung (Datum, Asset, id), sonst koennen Zeilen
 * zwischen Seiten doppelt oder gar nicht auftauchen.
 */
export async function getPortfolioSnapshotsAlle(
  supabase: DB, ab: string | null, assetIds: string[] = [],
): Promise<SnapshotZeile[]> {
  // Scope: Positionen der Assets im Scope (`assetIds` aus getHistoryAssets, es gibt keinen eigenen Scope-Parameter). portfolio_snapshots ist bisher owner-only (RLS);
  // Partner-Zeilen sieht erst die Peer-SELECT-Policy aus Migration 20261029110000 (nur als Datei). Bis dahin: nur eigene.
  if (assetIds.length === 0) return []
  const SEITE = 1000
  const alle: SnapshotZeile[] = []
  for (let von = 0; ; von += SEITE) {
    let q = supabase
      .from('portfolio_snapshots')
      .select('asset_id, snapshot_date, portfolio_name, quantity, price_eur, value_eur')
    q = q.in('asset_id', assetIds)
    if (ab) q = q.gte('snapshot_date', ab)
    const { data, error } = await q
      .order('snapshot_date', { ascending: true })
      .order('asset_id', { ascending: true })
      .order('id', { ascending: true })
      .range(von, von + SEITE - 1)
    if (error) throw new Error(`portfolio_snapshots: ${error.message}`)
    const zeilen = (data ?? []) as SnapshotZeile[]
    alle.push(...zeilen)
    if (zeilen.length < SEITE) break
  }
  return alle
}

/** Eine Seite der Tabelle, gefiltert nach Asset, Portfolio und Zeitraum. */
export async function getPortfolioTabelle(
  supabase: DB,
  filter: { assetIds: string[]; portfolio?: string; ab: string | null },
  range: { from: number; to: number },
): Promise<{ rows: PortfolioSnapshotHistoryRow[]; count: number }> {
  // Keine Assets: nicht fragen (`'__none__'` ist bei einer uuid-Spalte ein Typfehler).
  if (filter.assetIds.length === 0) return { rows: [], count: 0 }
  let q = supabase
    .from('portfolio_snapshots')
    .select('id, asset_id, snapshot_date, portfolio_name, quantity, price_eur, value_eur, source', { count: 'exact' })
    .in('asset_id', filter.assetIds)
  // `assetIds` (Assets im Scope) bestimmt die Menge.
  if (filter.portfolio) q = q.eq('portfolio_name', filter.portfolio)
  if (filter.ab) q = q.gte('snapshot_date', filter.ab)
  const { data, count, error } = await q
    .order('snapshot_date', { ascending: false })
    .order('asset_id')
    .order('id')
    .range(range.from, range.to)
  if (error) throw new Error(`portfolio_snapshots: ${error.message}`)
  return { rows: (data ?? []) as PortfolioSnapshotHistoryRow[], count: count ?? 0 }
}
