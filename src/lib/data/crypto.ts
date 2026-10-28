import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { scopedOwner } from '@/lib/data/scope-owner'

/**
 * Datenzugriff Crypto. Reine Funktionen: Client und userId kommen vom Aufrufer
 * (User-Client in Pages/Actions; Cron-Routen nutzen fuer owner-only-Daten eigene userId-Funktionen).
 */
type DB = SupabaseClient<Database>

export type CryptoAssetRow = Database['public']['Tables']['assets']['Row']

export type AssetWithPrice = CryptoAssetRow & {
  current_price: number | null
  current_value: number | null
  last_updated: string | null   // valuation_date aus asset_valuations
}

export type PortfolioSnapshotRow = {
  snapshot_date: string
  portfolio_name: string | null
  value_eur: number
}

export type AssetAuditEntry = {
  id: string
  asset_name: string
  asset_symbol: string
  action: string
  changes: Json | null
  created_at: string
}

const ASSET_COLUMNS =
  'id, user_id, account_id, name, symbol, type, exchange, portfolio_name, quantity, avg_buy_price, currency, source, notes, shared, created_at, updated_at'

/**
 * Krypto-/Stable-/Fiat-Assets im Scope, nach Name sortiert (eigene ODER geteilte).
 * Haushaltssicht ist nur lesend: Kraken-Assets (source='kraken') haengen an den Exchange-Keys des Eigentuemers.
 */
export async function getCryptoAssets(supabase: DB, ctx: ScopeContext): Promise<CryptoAssetRow[]> {
  const { data } = await scopedOwner(supabase.from('assets').select(ASSET_COLUMNS), ctx)
    .in('type', ['crypto', 'stable', 'fiat'])
    .order('name')
  return data ?? []
}

/** Assets inkl. jüngster Bewertung je Asset (View `asset_valuations_latest`). */
export async function getCryptoAssetsWithPrice(supabase: DB, ctx: ScopeContext): Promise<AssetWithPrice[]> {
  const assets = await getCryptoAssets(supabase, ctx)
  const assetIds = assets.map(a => a.id)

  // View `asset_valuations_latest`: je Asset genau der neueste Eintrag (valuation_date desc, created_at desc), identisch zur frueheren
  // Client-Sortierung — aber eine Zeile pro Asset statt der gesamten Bewertungshistorie.
  const { data: valuations } = assetIds.length
    ? await supabase
        .from('asset_valuations_latest')
        .select('asset_id, price_per_unit, total_value, valuation_date')
        .in('asset_id', assetIds)
    : { data: [] }

  const latest = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
  for (const v of valuations ?? []) {
    if (!v.asset_id || latest.has(v.asset_id)) continue
    latest.set(v.asset_id, {
      price_per_unit: v.price_per_unit as number,
      total_value:    v.total_value as number,
      valuation_date: v.valuation_date as string,
    })
  }

  return assets.map(a => {
    const val = latest.get(a.id)
    return {
      ...a,
      current_price: val?.price_per_unit ?? null,
      current_value: val?.total_value    ?? null,
      last_updated:  val?.valuation_date ?? null,
    }
  })
}

/** Portfolio-Snapshots ab einem Datum (Chart — bewusst ohne limit). OWNER-ONLY (portfolio_snapshots). */
export async function getPortfolioSnapshots(
  supabase: DB,
  userId: string,
  sinceDate: string,
): Promise<PortfolioSnapshotRow[]> {
  const { data } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, portfolio_name, value_eur')
    .eq('user_id', userId)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date')
  return data ?? []
}

/** Änderungsprotokoll — die UI zeigt ohnehin nur die letzten N Einträge. */
export async function getAssetAuditLog(
  supabase: DB,
  ctx: ScopeContext,
  limit = 50,
): Promise<AssetAuditEntry[]> {
  // asset_audit_log: Haushaltstabelle ohne shared-Spalte; user_id = Handelnder.
  const { data } = await scopedOwner(
    supabase.from('asset_audit_log').select('id, asset_name, asset_symbol, action, changes, created_at'),
    ctx,
    { sharedColumn: false },
  )
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Ob für die Exchange ein Key hinterlegt ist (ohne Entschlüsselung, ohne Secrets). OWNER-ONLY. */
export async function hasExchangeKey(supabase: DB, userId: string, exchange: string): Promise<boolean> {
  const { data } = await supabase
    .from('exchange_keys')
    .select('id')
    .eq('user_id', userId)
    .eq('exchange', exchange)
    .maybeSingle()
  return !!data
}

/** Einzelner user_settings-Wert (JSON) oder null. */
export async function getUserSettingValue(
  supabase: DB,
  userId: string,
  key: string,
): Promise<Json | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? null
}
