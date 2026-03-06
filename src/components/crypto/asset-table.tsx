'use client'

import { EditAssetDialog, DeleteAssetButton } from '@/components/crypto/asset-form'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'
import type { RebalancingRow } from '@/lib/crypto/rebalancing'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtQty = (n: number) =>
  new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: n < 1 ? 8 : 4,
    minimumFractionDigits: 0,
  }).format(n)

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2).replace('.', ',')} %`
}

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}.${m}.`
}

// ─── Group ordering ───────────────────────────────────────────────────────────
const PRIORITY: Record<string, number> = {
  Main: 0, Eltern: 1, 'High Beta': 2, Sonstige: 3,
}

function sortGroups(a: string, b: string): number {
  const pa = PRIORITY[a] ?? 4
  const pb = PRIORITY[b] ?? 4
  if (pa !== pb) return pa - pb
  return a.localeCompare(b)
}

type Group = { name: string; assets: AssetWithPrice[] }

function groupAssets(assets: AssetWithPrice[]): Group[] {
  const map = new Map<string, AssetWithPrice[]>()
  for (const asset of assets) {
    const key = asset.portfolio_name ?? 'Sonstige'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(asset)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => sortGroups(a, b))
    .map(([name, items]) => ({ name, assets: items }))
}

// ─── Rebalancing helpers ──────────────────────────────────────────────────────
function getSubPortfolio(portfolioName: string): 'core' | 'adam' | 'high_beta' | null {
  const lower = portfolioName.toLowerCase()
  if (lower.includes('main') || lower.includes('core'))   return 'core'
  if (lower.includes('eltern') || lower.includes('adam')) return 'adam'
  if (lower.includes('high'))                             return 'high_beta'
  return null
}

const STATUS_CLASS: Record<string, string> = {
  underweight: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  overweight:  'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300',
  balanced:    'bg-muted text-muted-foreground',
}
const STATUS_LABEL: Record<string, string> = {
  underweight: 'Untergewichtet',
  overweight:  'Übergewichtet',
  balanced:    'Balanced',
}

// ─── Group section ────────────────────────────────────────────────────────────
function GroupSection({ group, rebalancingRows }: { group: Group; rebalancingRows?: RebalancingRow[] }) {
  const groupValue = group.assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  // P&L only for assets with a known cost basis
  const pricedAssets = group.assets.filter(a => a.avg_buy_price != null)
  const groupCost    = pricedAssets.reduce((s, a) => s + a.avg_buy_price! * (a.quantity ?? 0), 0)
  const pricedValue  = pricedAssets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const groupPnL = groupCost > 0 ? pricedValue - groupCost : null

  const subKey      = getSubPortfolio(group.name)
  const groupRebRows = rebalancingRows?.filter(r => r.sub_portfolio === subKey) ?? []
  const hasReb       = rebalancingRows != null

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {group.name}
        </h2>
        <div className="flex items-center gap-3">
          {groupPnL != null && (
            <span className={`text-xs font-medium ${groupPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {groupPnL >= 0 ? '+' : ''}{fmtEur(groupPnL)}
            </span>
          )}
          <span className="text-sm font-medium">{fmtEur(groupValue)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className={`w-full text-sm ${hasReb ? 'min-w-[980px]' : 'min-w-[720px]'}`}>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Asset</th>
              <th className="text-right px-4 py-2.5 font-medium">Menge</th>
              <th className="text-right px-4 py-2.5 font-medium">Ø Kauf</th>
              <th className="text-right px-4 py-2.5 font-medium">Akt. Preis</th>
              <th className="text-right px-4 py-2.5 font-medium">Wert</th>
              <th className="text-right px-4 py-2.5 font-medium">P&amp;L (€)</th>
              <th className="text-right px-4 py-2.5 font-medium">P&amp;L (%)</th>
              {hasReb && <>
                <th className="text-right px-4 py-2.5 font-medium">Ziel €</th>
                <th className="text-right px-4 py-2.5 font-medium">Diff. €</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </>}
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {group.assets.map((asset, i) => {
              const rebRow = rebalancingRows?.find(r =>
                r.coingecko_id === asset.symbol &&
                r.sub_portfolio === subKey
              )
              return (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  isLast={i === group.assets.length - 1}
                  rebRow={rebRow}
                  hasReb={hasReb}
                />
              )
            })}
            <SumRow assets={group.assets} groupRebRows={groupRebRows} hasReb={hasReb} />
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Asset row ────────────────────────────────────────────────────────────────
function AssetRow({
  asset, isLast, rebRow, hasReb,
}: {
  asset:   AssetWithPrice
  isLast:  boolean
  rebRow?: RebalancingRow
  hasReb:  boolean
}) {
  const quantity     = asset.quantity ?? 0
  const currentPrice = asset.current_price
  const currentValue = asset.current_value
  const costBasis    = asset.avg_buy_price != null ? quantity * asset.avg_buy_price : null
  const pnlAbs       = currentValue != null && costBasis != null ? currentValue - costBasis : null
  const pnlPct       = pnlAbs != null && costBasis != null && costBasis > 0
    ? (pnlAbs / costBasis) * 100
    : null
  const isPositive   = pnlAbs != null && pnlAbs >= 0

  const pnlClass = isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  const diffClass = rebRow
    ? rebRow.action === 'buy'  ? 'text-green-600 dark:text-green-400'
    : rebRow.action === 'sell' ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground'
    : ''

  return (
    <tr className={`group hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}>
      {/* Asset */}
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
        {asset.avg_buy_price != null ? fmtEur(asset.avg_buy_price) : '—'}
      </td>

      {/* Akt. Preis */}
      <td className="px-4 py-3 text-right">
        {currentPrice != null ? (
          <div>
            <p>{fmtEur(currentPrice)}</p>
            {asset.last_updated && (
              <p className="text-xs text-muted-foreground">{fmtDate(asset.last_updated)}</p>
            )}
          </div>
        ) : '—'}
      </td>

      {/* Wert */}
      <td className="px-4 py-3 text-right font-medium">
        {currentValue != null ? fmtEur(currentValue) : '—'}
      </td>

      {/* P&L € */}
      <td className={`px-4 py-3 text-right font-medium ${pnlAbs != null ? pnlClass : ''}`}>
        {pnlAbs != null ? `${isPositive ? '+' : ''}${fmtEur(pnlAbs)}` : '—'}
      </td>

      {/* P&L % */}
      <td className={`px-4 py-3 text-right text-sm ${pnlPct != null ? pnlClass : ''}`}>
        {pnlPct != null ? fmtPct(pnlPct) : '—'}
      </td>

      {/* Rebalancing columns */}
      {hasReb && <>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {rebRow ? fmtEur(rebRow.target_eur) : '—'}
        </td>
        <td className={`px-4 py-3 text-right tabular-nums font-medium ${diffClass}`}>
          {rebRow ? `${rebRow.diff_eur >= 0 ? '+' : ''}${fmtEur(rebRow.diff_eur)}` : '—'}
        </td>
        <td className="px-4 py-3">
          {rebRow ? (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[rebRow.status]}`}>
              {STATUS_LABEL[rebRow.status]}
            </span>
          ) : '—'}
        </td>
      </>}

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <EditAssetDialog asset={asset} />
          <DeleteAssetButton asset={asset} />
        </div>
      </td>
    </tr>
  )
}

// ─── Sum row ──────────────────────────────────────────────────────────────────
function SumRow({ assets, groupRebRows, hasReb }: { assets: AssetWithPrice[]; groupRebRows: RebalancingRow[]; hasReb: boolean }) {
  const totalValue   = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  // Only include assets with known cost basis in P&L to avoid inflated numbers
  const pricedAssets = assets.filter(a => a.avg_buy_price != null)
  const totalCost    = pricedAssets.reduce((s, a) => s + a.avg_buy_price! * (a.quantity ?? 0), 0)
  const pricedValue  = pricedAssets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const totalPnL     = totalCost > 0 ? pricedValue - totalCost : null
  const totalPnLPct  = totalPnL != null && totalCost > 0 ? (totalPnL / totalCost) * 100 : null
  const isPositive   = totalPnL != null && totalPnL >= 0
  const pnlClass     = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'

  const totalTarget = groupRebRows.reduce((s, r) => s + r.target_eur, 0)
  const totalDiff   = groupRebRows.reduce((s, r) => s + r.diff_eur, 0)
  const diffClass   = totalDiff > 50  ? 'text-green-600 dark:text-green-400'
                    : totalDiff < -50 ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'

  return (
    <tr className="border-t border-border bg-muted/20 font-semibold text-sm">
      <td className="px-4 py-2.5 text-muted-foreground" colSpan={4}>Gesamt</td>
      <td className="px-4 py-2.5 text-right">{fmtEur(totalValue)}</td>
      <td className={`px-4 py-2.5 text-right ${totalPnL != null ? pnlClass : ''}`}>
        {totalPnL != null ? `${isPositive ? '+' : ''}${fmtEur(totalPnL)}` : '—'}
      </td>
      <td className={`px-4 py-2.5 text-right ${totalPnLPct != null ? pnlClass : ''}`}>
        {totalPnLPct != null ? fmtPct(totalPnLPct) : '—'}
      </td>
      {hasReb && <>
        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
          {groupRebRows.length > 0 ? fmtEur(totalTarget) : '—'}
        </td>
        <td className={`px-4 py-2.5 text-right tabular-nums ${groupRebRows.length > 0 ? diffClass : ''}`}>
          {groupRebRows.length > 0 ? `${totalDiff >= 0 ? '+' : ''}${fmtEur(totalDiff)}` : '—'}
        </td>
        <td />
      </>}
      <td />
    </tr>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────
export function AssetTable({ assets, rebalancingRows }: { assets: AssetWithPrice[]; rebalancingRows?: RebalancingRow[] }) {
  const groups = groupAssets(assets)
  return (
    <div className="space-y-6">
      {groups.map(group => (
        <GroupSection key={group.name} group={group} rebalancingRows={rebalancingRows} />
      ))}
    </div>
  )
}
