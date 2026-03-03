import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { AddAssetDialog, EditAssetDialog, DeleteAssetButton } from '@/components/crypto/asset-form'
import { RefreshButton } from '@/components/crypto/refresh-button'
import { PortfolioChart } from '@/components/crypto/portfolio-chart'

type Asset      = Database['public']['Tables']['assets']['Row']
type Valuation  = Database['public']['Tables']['asset_valuations']['Row']

type AssetWithValuation = Asset & { latestValuation: Valuation | null }
type PortfolioGroup     = { name: string; assets: AssetWithValuation[]; totalValue: number }

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtQty = (n: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(n)

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`
}

// Timezone-safe date display from "YYYY-MM-DD"
function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}.${m}.`
}

// ─── Grouping ─────────────────────────────────────────────────────────────────
function groupByPortfolio(assets: AssetWithValuation[]): PortfolioGroup[] {
  const map = new Map<string, AssetWithValuation[]>()
  for (const asset of assets) {
    const key = asset.portfolio_name ?? 'Sonstige'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(asset)
  }
  return Array.from(map.entries()).map(([name, items]) => ({
    name,
    assets: items,
    totalValue: items.reduce((s, a) => s + (a.latestValuation?.total_value ?? 0), 0),
  }))
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function CryptoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: rawAssets }, { data: snapshots }] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('type', 'crypto')
      .eq('user_id', user!.id)
      .order('name'),
    supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, portfolio_name, value_eur')
      .eq('user_id', user!.id)
      .order('snapshot_date'),
  ])

  const assetIds = (rawAssets ?? []).map(a => a.id)

  const { data: rawValuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('*')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] }

  // Latest valuation per asset (first match wins due to ordering)
  const latestMap = new Map<string, Valuation>()
  for (const v of rawValuations ?? []) {
    if (!latestMap.has(v.asset_id)) latestMap.set(v.asset_id, v)
  }

  const assets: AssetWithValuation[] = (rawAssets ?? []).map(a => ({
    ...a,
    latestValuation: latestMap.get(a.id) ?? null,
  }))

  const portfolios = groupByPortfolio(assets)
  const totalValue = portfolios.reduce((s, p) => s + p.totalValue, 0)
  const totalCost  = assets.reduce((s, a) => {
    if (a.avg_buy_price == null || a.quantity == null) return s
    return s + a.avg_buy_price * a.quantity
  }, 0)
  const totalPnl   = totalCost > 0 ? totalValue - totalCost : null

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crypto Portfolio</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {assets.length} Assets · Gesamtwert {fmt(totalValue)}
            {totalPnl != null && (
              <span className={`ml-2 font-medium ${totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <AddAssetDialog />
        </div>
      </div>

      {assets.length === 0 && <EmptyState />}

      {/* History chart */}
      {(snapshots?.length ?? 0) > 0 && (
        <PortfolioChart snapshots={snapshots!} />
      )}

      {portfolios.map(portfolio => (
        <PortfolioSection key={portfolio.name} portfolio={portfolio} />
      ))}
    </div>
  )
}

// ─── Portfolio section ────────────────────────────────────────────────────────
function PortfolioSection({ portfolio }: { portfolio: PortfolioGroup }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {portfolio.name}
        </h2>
        <span className="text-sm font-medium">{fmt(portfolio.totalValue)}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Asset</th>
              <th className="text-right px-4 py-2.5 font-medium">Menge</th>
              <th className="text-right px-4 py-2.5 font-medium">Ø Kauf</th>
              <th className="text-right px-4 py-2.5 font-medium">Akt. Preis</th>
              <th className="text-right px-4 py-2.5 font-medium">Wert</th>
              <th className="text-right px-4 py-2.5 font-medium">P&amp;L</th>
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {portfolio.assets.map((asset, i) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                isLast={i === portfolio.assets.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Asset row ────────────────────────────────────────────────────────────────
function AssetRow({ asset, isLast }: { asset: AssetWithValuation; isLast: boolean }) {
  const quantity     = asset.quantity ?? 0
  const currentPrice = asset.latestValuation?.price_per_unit ?? null
  const currentValue = asset.latestValuation?.total_value ?? null
  const costBasis    = asset.avg_buy_price != null ? quantity * asset.avg_buy_price : null
  const pnlAbs       = currentValue != null && costBasis != null ? currentValue - costBasis : null
  const pnlPct       = pnlAbs != null && costBasis && costBasis > 0 ? (pnlAbs / costBasis) * 100 : null
  const isPositive   = pnlAbs != null && pnlAbs >= 0

  return (
    <tr className={`group hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}>
      {/* Asset name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div>
            <p className="font-medium leading-snug">{asset.name}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{asset.symbol}</p>
          </div>
          {asset.exchange && (
            <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 leading-tight">
              {asset.exchange}
            </span>
          )}
        </div>
      </td>

      {/* Menge */}
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {fmtQty(quantity)}
      </td>

      {/* Ø Kaufpreis */}
      <td className="px-4 py-3 text-right text-muted-foreground">
        {asset.avg_buy_price != null ? fmt(asset.avg_buy_price) : '—'}
      </td>

      {/* Aktueller Preis */}
      <td className="px-4 py-3 text-right">
        {currentPrice != null ? (
          <div>
            <p>{fmt(currentPrice)}</p>
            {asset.latestValuation?.valuation_date && (
              <p className="text-xs text-muted-foreground">
                {fmtDate(asset.latestValuation.valuation_date)}
              </p>
            )}
          </div>
        ) : '—'}
      </td>

      {/* Wert */}
      <td className="px-4 py-3 text-right font-medium">
        {currentValue != null ? fmt(currentValue) : '—'}
      </td>

      {/* P&L */}
      <td className="px-4 py-3 text-right">
        {pnlAbs != null ? (
          <div className={isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            <p className="font-medium">{isPositive ? '+' : ''}{fmt(pnlAbs)}</p>
            {pnlPct != null && (
              <p className="text-xs">{fmtPct(pnlPct)}</p>
            )}
          </div>
        ) : '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditAssetDialog asset={asset} />
          <DeleteAssetButton asset={asset} />
        </div>
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Crypto-Assets</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Füge dein erstes Asset hinzu und aktualisiere dann die Preise via CoinGecko.
      </p>
    </div>
  )
}
