'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'
import type { RebalancingRow } from '@/lib/crypto/rebalancing'

// ─── Colors ───────────────────────────────────────────────────────────────────
const COIN_COLORS: Record<string, string> = {
  'bitcoin':          '#F7931A',
  'ethereum':         '#627EEA',
  'binancecoin':      '#F3BA2F',
  'solana':           '#9945FF',
  'convex-finance':   '#4A5568',
  'cardano':          '#3CC8C8',
  'polkadot':         '#E6007A',
  'chainlink':        '#2A5ADA',
  'avalanche-2':      '#E84142',
  'matic-network':    '#8247E5',
  'ripple':           '#346AA9',
  'litecoin':         '#BFBBBB',
}
const FALLBACK_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function getColor(coingeckoId: string, index: number): string {
  return COIN_COLORS[coingeckoId] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: DonutEntry }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-sm">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground tabular-nums">{d.payload.pct.toFixed(1)} % · {fmtEur(d.value)}</p>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DonutEntry {
  label:        string
  coingecko_id: string
  value:        number
  pct:          number
}

// ─── Single donut card ────────────────────────────────────────────────────────
function DonutCard({ title, subtitle, data }: { title: string; subtitle: string; data: DonutEntry[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={65}
              outerRadius={95}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={entry.coingecko_id} fill={getColor(entry.coingecko_id, i)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={`${d.coingecko_id}-${i}`} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getColor(d.coingecko_id, i) }}
              />
              <span className="font-medium">{d.label}</span>
            </div>
            <span className="text-muted-foreground tabular-nums">{d.pct.toFixed(1).replace('.', ',')} %</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  assets:          AssetWithPrice[]
  rebalancingRows: RebalancingRow[]
}

export function PortfolioDonut({ assets, rebalancingRows }: Props) {
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
  const istData: DonutEntry[] = Array.from(istMap.entries())
    .map(([id, value]) => ({
      label:        labelMap.get(id) ?? id.toUpperCase(),
      coingecko_id: id,
      value,
      pct:          totalIst > 0 ? (value / totalIst) * 100 : 0,
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // ── ZIEL data: sum target_pct per coingecko_id from rebalancing rows ────────
  const zielMap = new Map<string, { label: string; value: number }>()
  for (const r of rebalancingRows) {
    const existing = zielMap.get(r.coingecko_id)
    if (existing) existing.value += r.target_pct
    else zielMap.set(r.coingecko_id, { label: r.symbol, value: r.target_pct })
  }
  const totalZiel = Array.from(zielMap.values()).reduce((s, v) => s + v.value, 0)
  const zielData: DonutEntry[] = Array.from(zielMap.entries())
    .map(([id, { label, value }]) => ({
      label,
      coingecko_id: id,
      value,
      pct: totalZiel > 0 ? (value / totalZiel) * 100 : 0,
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  if (istData.length === 0 && zielData.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {istData.length > 0 && (
        <DonutCard
          title="Aktuelle Verteilung"
          subtitle={fmtEur(totalIst)}
          data={istData}
        />
      )}
      {zielData.length > 0 && (
        <DonutCard
          title="Ziel-Verteilung"
          subtitle="Zielallokation"
          data={zielData}
        />
      )}
    </div>
  )
}
