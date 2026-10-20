import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

/**
 * Datenzugriff Crypto. Reine Funktionen: Client und userId kommen vom Aufrufer
 * (User-Client in Pages/Actions, Admin-Client in Cron-Routen).
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
  'id, user_id, account_id, name, symbol, type, exchange, portfolio_name, quantity, avg_buy_price, currency, source, notes, created_at, updated_at'

/** Krypto-/Stable-/Fiat-Assets des Users, nach Name sortiert. */
export async function getCryptoAssets(supabase: DB, userId: string): Promise<CryptoAssetRow[]> {
  const { data } = await supabase
    .from('assets')
    .select(ASSET_COLUMNS)
    .in('type', ['crypto', 'stable', 'fiat'])
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

/**
 * Assets inkl. jüngster Bewertung je Asset.
 * Lädt die komplette Bewertungshistorie der Assets (unbegrenzt — Kandidat für eine
 * "letzte Bewertung je Asset"-View), da der Neueste je Asset clientseitig gewählt wird.
 */
export async function getCryptoAssetsWithPrice(supabase: DB, userId: string): Promise<AssetWithPrice[]> {
  const assets = await getCryptoAssets(supabase, userId)
  const assetIds = assets.map(a => a.id)

  const { data: valuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('asset_id, price_per_unit, total_value, valuation_date')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at',    { ascending: false })
    : { data: [] }

  const latest = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
  for (const v of valuations ?? []) {
    if (!latest.has(v.asset_id)) {
      latest.set(v.asset_id, {
        price_per_unit: v.price_per_unit,
        total_value:    v.total_value,
        valuation_date: v.valuation_date,
      })
    }
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

/** Portfolio-Snapshots ab einem Datum (Chart — bewusst ohne limit). */
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
  userId: string,
  limit = 50,
): Promise<AssetAuditEntry[]> {
  const { data } = await supabase
    .from('asset_audit_log')
    .select('id, asset_name, asset_symbol, action, changes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Ob für die Exchange ein Key hinterlegt ist (ohne Entschlüsselung, ohne Secrets). */
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
