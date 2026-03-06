'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'
import { getPrices } from '@/lib/crypto/coingecko'
import { refreshPrices } from '@/app/(dashboard)/crypto/actions'
import { AssetFormDialog } from '@/components/crypto/asset-form'
import { PortfolioChart, type SnapshotRow } from '@/components/crypto/portfolio-chart'
import { AssetTable } from '@/components/crypto/asset-table'
import { PortfolioDonut } from '@/components/crypto/portfolio-donut'
import { Database } from '@/types/database'
import type { RebalancingRow } from '@/lib/crypto/rebalancing'

type AssetRow = Database['public']['Tables']['assets']['Row']

// AssetWithPrice extends the full DB row so EditAssetDialog receives all required fields
export type AssetWithPrice = AssetRow & {
  current_price: number | null
  current_value: number | null
  last_updated: string | null   // valuation_date from asset_valuations
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function fmtSecondsAgo(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  initialAssets:    AssetWithPrice[]
  snapshots:        SnapshotRow[]
  rebalancingRows?: RebalancingRow[]
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PortfolioOverview({ initialAssets, snapshots, rebalancingRows }: Props) {
  const router = useRouter()

  const [assets, setAssets]               = useState<AssetWithPrice[]>(initialAssets)
  const [secondsAgo, setSecondsAgo]       = useState(0)
  const [isRefreshing, setIsRefreshing]   = useState(false)
  const [message, setMessage]             = useState<{ text: string; ok: boolean } | null>(null)
  const [assetFormOpen, setAssetFormOpen] = useState(false)

  // Sync when server re-renders (e.g. after adding a new asset)
  useEffect(() => {
    setAssets(initialAssets)
  }, [initialAssets])

  // ─── "Vor X Sekunden" counter — starts client-side only to avoid hydration mismatch
  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1_000)
    return () => clearInterval(interval)
  }, [])

  // ─── Auto-refresh prices every 60s (client-side only, no DB write) ──────────
  useEffect(() => {
    const coingeckoIds = [...new Set(
      assets.map(a => a.symbol).filter((s): s is string => !!s)
    )]
    if (coingeckoIds.length === 0) return

    const tick = async () => {
      try {
        const prices = await getPrices(coingeckoIds)
        setAssets(prev => prev.map(a => {
          if (!a.symbol) return a
          const price = prices[a.symbol]
          if (price == null) return a
          return { ...a, current_price: price, current_value: (a.quantity ?? 0) * price }
        }))
        setSecondsAgo(0)
      } catch {
        // Non-critical — silently skip
      }
    }

    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Manual refresh (DB write + immediate client state update) ──────────────
  async function handleManualRefresh() {
    setIsRefreshing(true)
    setMessage(null)
    try {
      const result = await refreshPrices()
      if (result.error) {
        setMessage({ text: result.error, ok: false })
        return
      }

      const coingeckoIds = [...new Set(
        assets.map(a => a.symbol).filter((s): s is string => !!s)
      )]
      const prices = await getPrices(coingeckoIds)
      setAssets(prev => prev.map(a => {
        if (!a.symbol) return a
        const price = prices[a.symbol]
        if (price == null) return a
        return { ...a, current_price: price, current_value: (a.quantity ?? 0) * price }
      }))
      setSecondsAgo(0)
      setMessage({
        text: `${result.updated ?? 0} Preis${result.updated === 1 ? '' : 'e'} aktualisiert`,
        ok: true,
      })
      router.refresh()
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Fehler', ok: false })
    } finally {
      setIsRefreshing(false)
    }
  }

  // ─── Derived totals ──────────────────────────────────────────────────────────
  const totalValue   = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  // P&L only for assets with a known cost basis (fiat/stables without avg_buy_price excluded)
  const pricedAssets = assets.filter(a => a.avg_buy_price != null && a.quantity != null)
  const totalCost    = pricedAssets.reduce((s, a) => s + a.avg_buy_price! * a.quantity!, 0)
  const pricedValue  = pricedAssets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const totalPnL    = totalCost > 0 ? pricedValue - totalCost : null
  const totalPnLPct = totalPnL != null && totalCost > 0 ? (totalPnL / totalCost) * 100 : null
  const isPositive  = totalPnL != null && totalPnL >= 0

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crypto Portfolio</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {assets.length} Assets · Gesamtwert {fmtEur(totalValue)}
            {totalPnL != null && (
              <span className={`ml-2 font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '+' : ''}{fmtEur(totalPnL)}
                {totalPnLPct != null && (
                  <> / {isPositive ? '+' : ''}{totalPnLPct.toFixed(2).replace('.', ',')} %</>
                )}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Last-refresh badge */}
          <span className="text-xs text-muted-foreground border border-border rounded-full px-2.5 py-1">
            Vor {fmtSecondsAgo(secondsAgo)} aktualisiert
          </span>

          {/* Feedback message */}
          {message && (
            <span className={`text-xs ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
              {message.text}
            </span>
          )}

          <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={isRefreshing}>
            <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Aktualisiert…' : 'Preise aktualisieren'}
          </Button>

          <Button size="sm" onClick={() => setAssetFormOpen(true)}>
            <Plus className="size-4" />
            Asset anlegen
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {assets.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium">Noch keine Crypto-Assets</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Füge dein erstes Asset hinzu und aktualisiere dann die Preise via CoinGecko.
          </p>
        </div>
      )}

      {/* Chart */}
      {snapshots.length > 0 && <PortfolioChart snapshots={snapshots} />}

      {/* IST vs ZIEL donuts */}
      {rebalancingRows && rebalancingRows.length > 0 && (
        <PortfolioDonut assets={assets} rebalancingRows={rebalancingRows} />
      )}

      {/* Asset table */}
      {assets.length > 0 && <AssetTable assets={assets} rebalancingRows={rebalancingRows} />}

      {/* Add asset dialog */}
      <AssetFormDialog
        open={assetFormOpen}
        onOpenChange={setAssetFormOpen}
        onSuccess={() => {
          setAssetFormOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}
