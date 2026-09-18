'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'
import { refreshPrices } from '@/app/(dashboard)/crypto/actions'
import { AssetFormDialog } from '@/components/crypto/asset-form'
import { PortfolioChart, type SnapshotRow } from '@/components/crypto/portfolio-chart'
import { AssetTable } from '@/components/crypto/asset-table'
import { PortfolioDonut } from '@/components/crypto/portfolio-donut'
import { Database } from '@/types/database'
import type { RebalancingRow } from '@/lib/crypto/rebalancing'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

type AssetRow = Database['public']['Tables']['assets']['Row']

// AssetWithPrice extends the full DB row so EditAssetDialog receives all required fields
export type AssetWithPrice = AssetRow & {
  current_price: number | null
  current_value: number | null
  last_updated: string | null   // valuation_date from asset_valuations
}

type PriceSource = 'kraken' | 'coingecko' | 'fiat'

/**
 * Holt EUR-Kurse über /api/crypto/prices — Kraken zuerst, CoinGecko nur als Fallback.
 *
 * Vorher rief diese Komponente `getPrices()` (CoinGecko) direkt aus dem Browser auf: ohne
 * API-Key, gegen das IP-Rate-Limit des Nutzers, im 60-Sekunden-Takt, und pro geöffnetem Tab
 * erneut. Bei einem 429 blieb der Fehler still und die Anzeige stand auf alten Zahlen.
 */
async function fetchPrices(ids: string[]): Promise<{ prices: Record<string, number>; sources: Record<string, PriceSource> }> {
  const res = await fetch(`/api/crypto/prices?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Kurse nicht abrufbar (${res.status})`)
  return res.json()
}

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
  eurUsdRate?:      number
  activePortfolio?: string
  readonly?:        boolean
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PortfolioOverview({ initialAssets, snapshots, rebalancingRows, eurUsdRate, activePortfolio, readonly }: Props) {
  const { locale } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale)
  const router = useRouter()

  const [assets, setAssets]               = useState<AssetWithPrice[]>(initialAssets)
  const [secondsAgo, setSecondsAgo]       = useState(0)
  const [isRefreshing, setIsRefreshing]   = useState(false)
  const [message, setMessage]             = useState<{ text: string; ok: boolean } | null>(null)
  const [assetFormOpen, setAssetFormOpen] = useState(false)
  const [priceSource, setPriceSource]     = useState<PriceSource | 'mixed' | null>(null)
  // Ein stiller Fehlschlag hat vorher wie "Kurse sind aktuell" ausgesehen — die Badge zeigt
  // jetzt an, wenn der letzte Tick nichts geliefert hat.
  const [priceStale, setPriceStale]       = useState(false)

  // Sync when server re-renders (e.g. after adding a new asset)
  useEffect(() => {
    setAssets(initialAssets)
  }, [initialAssets])

  // ─── "Vor X Sekunden" counter — starts client-side only to avoid hydration mismatch
  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1_000)
    return () => clearInterval(interval)
  }, [])

  // ─── Auto-refresh prices on mount + every 60s (client-side, no DB write) ─────
  useEffect(() => {
    const coingeckoIds = [...new Set(
      assets.map(a => a.symbol).filter((s): s is string => !!s)
    )]
    if (coingeckoIds.length === 0) return

    const tick = async () => {
      try {
        const { prices, sources } = await fetchPrices(coingeckoIds)
        if (Object.keys(prices).length === 0) { setPriceStale(true); return }
        setAssets(prev => prev.map(a => {
          if (!a.symbol) return a
          const price = prices[a.symbol]
          if (price == null) return a
          return { ...a, current_price: price, current_value: (a.quantity ?? 0) * price }
        }))
        const used = [...new Set(Object.values(sources))]
        setPriceSource(used.length === 1 ? used[0] : used.length > 1 ? 'mixed' : null)
        setPriceStale(false)
        setSecondsAgo(0)
      } catch {
        setPriceStale(true)
      }
    }

    // Fetch immediately so missing DB valuations are filled on first render
    tick()
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
      const { prices, sources } = await fetchPrices(coingeckoIds)
      setAssets(prev => prev.map(a => {
        if (!a.symbol) return a
        const price = prices[a.symbol]
        if (price == null) return a
        return { ...a, current_price: price, current_value: (a.quantity ?? 0) * price }
      }))
      const used = [...new Set(Object.values(sources))]
      setPriceSource(used.length === 1 ? used[0] : used.length > 1 ? 'mixed' : null)
      setPriceStale(false)
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

  // ─── Chart: "heute" live statt aus der letzten persistierten Momentaufnahme ──
  // `snapshots` kommt aus portfolio_snapshots — die wird nur beim naechtlichen
  // Cron (23:59) bzw. bei einem Bank-Sync neu geschrieben. Tagsueber steht dort
  // oft noch der Preis vom letzten Lauf (oder 0, wenn der Preisabruf in dem
  // Moment leer war), waehrend `assets` hier laufend mit frischen Kursen
  // aktualisiert wird (siehe Preis-Tick oben). Ohne diese Ueberschreibung zeigte
  // der Chart fuer "heute" z.B. 0 EUR, obwohl auf dem Konto laengst Geld lag.
  // Der Cron ersetzt diesen Punkt am naechsten Tag ohnehin durch den fest
  // gespeicherten Wert.
  const todayStr = new Date().toISOString().slice(0, 10)
  const chartSnapshots = useMemo(() => {
    const liveByPortfolio = new Map<string, number>()
    for (const a of assets) {
      const key = a.portfolio_name ?? 'Sonstige'
      liveByPortfolio.set(key, (liveByPortfolio.get(key) ?? 0) + (a.current_value ?? 0))
    }
    const withoutToday = snapshots.filter(s => s.snapshot_date !== todayStr)
    const todayRows: SnapshotRow[] = Array.from(liveByPortfolio, ([portfolio_name, value_eur]) => ({
      snapshot_date: todayStr, portfolio_name, value_eur,
    }))
    return [...withoutToday, ...todayRows]
  }, [snapshots, assets, todayStr])

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
          <h1 className="text-2xl font-semibold tracking-tight">{activePortfolio ?? 'Crypto Portfolio'}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {assets.length} Assets · Gesamtwert <span className="tabular-nums">{fmtEur(totalValue)}</span>
            {totalPnL != null && (
              <span className={`ml-2 font-medium tabular-nums ${isPositive ? 'text-success' : 'text-danger'}`}>
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
          <span
            className={`text-xs border rounded-full px-2.5 py-1 ${
              priceStale
                ? 'border-danger/40 text-danger'
                : 'border-border text-muted-foreground'
            }`}
            title={priceStale ? 'Der letzte Kursabruf hat keine Daten geliefert.' : undefined}
          >
            {priceStale ? 'Kurse veraltet' : `Vor ${fmtSecondsAgo(secondsAgo)} aktualisiert`}
            {!priceStale && priceSource && (
              <span className="ml-1 opacity-70">
                · {priceSource === 'kraken' ? 'Kraken' : priceSource === 'coingecko' ? 'CoinGecko' : priceSource === 'fiat' ? 'Nennwert' : 'gemischt'}
              </span>
            )}
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

          {!readonly && (
            <Button size="sm" onClick={() => setAssetFormOpen(true)}>
              <Plus className="size-4" />
              Asset anlegen
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {assets.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium">Noch keine Crypto-Assets</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Füge dein erstes Asset hinzu — die Kurse kommen dann automatisch von Kraken bzw.
            CoinGecko.
          </p>
        </div>
      )}

      {/* Chart */}
      {snapshots.length > 0 && <PortfolioChart snapshots={chartSnapshots} />}

      {/* IST vs ZIEL donuts */}
      {rebalancingRows && rebalancingRows.length > 0 && (
        <PortfolioDonut assets={assets} rebalancingRows={rebalancingRows} eurUsdRate={eurUsdRate} />
      )}

      {/* Asset table */}
      {assets.length > 0 && <AssetTable assets={assets} rebalancingRows={rebalancingRows} readonly={readonly} />}

      {/* Add asset dialog */}
      {!readonly && (
        <AssetFormDialog
          open={assetFormOpen}
          onOpenChange={setAssetFormOpen}
          onSuccess={() => {
            setAssetFormOpen(false)
            router.refresh()
          }}
          defaultPortfolio={activePortfolio}
        />
      )}
    </div>
  )
}
