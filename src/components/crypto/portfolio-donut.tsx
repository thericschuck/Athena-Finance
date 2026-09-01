'use client'

import dynamic from 'next/dynamic'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'
import type { RebalancingRow } from '@/lib/crypto/rebalancing'
import type { DonutEntry } from '@/components/crypto/portfolio-donut-card'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

// recharts is a heavy dependency — load it on demand, client-only.
const DonutCard = dynamic(
  () => import('@/components/crypto/portfolio-donut-card').then(m => m.DonutCard),
  { ssr: false }
)

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  assets:          AssetWithPrice[]
  rebalancingRows: RebalancingRow[]
  eurUsdRate?:     number
}

export function PortfolioDonut({ assets, rebalancingRows, eurUsdRate }: Props) {
  const { locale } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale)
  const fmtUsd = eurUsdRate ? (n: number) => fmtCurrency(n, 'USD', locale) : null
  // Build label map from rebalancing rows (coingecko_id → ticker symbol like "BTC")
  const labelMap = new Map<string, string>()
  for (const r of rebalancingRows) {
    labelMap.set(r.coingecko_id, r.symbol)
  }

  // ── IST data: sum current_value per coingecko_id ───────────────────────────
  const istMap = new Map<string, number>()
  for (const a of assets) {
    if (!a.symbol || !a.current_value) continue
    istMap.set(a.symbol, (istMap.get(a.symbol) ?? 0) + a.current_value)
  }
  const totalIst = Array.from(istMap.values()).reduce((s, v) => s + v, 0)

  // Below this, a slice is too thin to read anything from anyway — same threshold as the
  // asset table's dust cutoff. Folded into one "Sonstige" slice instead of just dropped, so
  // the donut's percentages still add up to the real total.
  const DUST_THRESHOLD_EUR = 1
  const istEntries = Array.from(istMap.entries()).filter(([, value]) => value > 0)
  const dustSum = istEntries
    .filter(([, value]) => value < DUST_THRESHOLD_EUR)
    .reduce((s, [, value]) => s + value, 0)

  const istData: DonutEntry[] = istEntries
    .filter(([, value]) => value >= DUST_THRESHOLD_EUR)
    .map(([id, value]) => ({
      label:        labelMap.get(id) ?? id.toUpperCase(),
      coingecko_id: id,
      value,
      pct:          totalIst > 0 ? (value / totalIst) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
  if (dustSum > 0) {
    istData.push({
      label:        'Sonstige',
      coingecko_id: '__dust__',
      value:        dustSum,
      pct:          totalIst > 0 ? (dustSum / totalIst) * 100 : 0,
    })
  }

  // ── ZIEL data: sum target_eur per coingecko_id from rebalancing rows ─────────
  const zielMap = new Map<string, { label: string; value: number }>()
  for (const r of rebalancingRows) {
    const existing = zielMap.get(r.coingecko_id)
    if (existing) existing.value += r.target_eur
    else zielMap.set(r.coingecko_id, { label: r.symbol, value: r.target_eur })
  }
  const totalZiel = Array.from(zielMap.values()).reduce((s, v) => s + v.value, 0)
  const zielData: DonutEntry[] = Array.from(zielMap.entries())
    .reduce<DonutEntry[]>((acc, [id, { label, value }]) => {
      if (value > 0) {
        acc.push({
          label,
          coingecko_id: id,
          value,
          pct: totalZiel > 0 ? (value / totalZiel) * 100 : 0,
        })
      }
      return acc
    }, [])
    .sort((a, b) => b.value - a.value)

  if (istData.length === 0 && zielData.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {istData.length > 0 && (
        <DonutCard
          title="Aktuelle Verteilung"
          subtitle={`${fmtEur(totalIst)}${eurUsdRate && fmtUsd ? ` · ${fmtUsd(totalIst * eurUsdRate)}` : ''}`}
          data={istData}
          eurUsdRate={eurUsdRate}
        />
      )}
      {zielData.length > 0 && (
        <DonutCard
          title="Ziel-Verteilung"
          subtitle={`${fmtEur(totalZiel)}${eurUsdRate && fmtUsd ? ` · ${fmtUsd(totalZiel * eurUsdRate)}` : ''}`}
          data={zielData}
          eurUsdRate={eurUsdRate}
        />
      )}
    </div>
  )
}
