'use client'

// Recharts-dependent rendering split out of portfolio-donut.tsx so it can be
// loaded on demand via next/dynamic (react-doctor/prefer-dynamic-import) —
// recharts is a heavy dependency and this chart is non-critical, below-the-fold UI.

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

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
  'pax-gold':         '#D4AF37',
}
// Fällt nur für Coins ohne Markenfarbe oben (z. B. neuere Listings wie
// 'hyperliquid') zurück — dieselbe gedeckte Oliv/Gold/Terrakotta-Familie wie
// die Analyse-Komponenten, statt eines beliebigen Regenbogens. COIN_COLORS
// selbst bleiben unangetastet: das sind echte Markenfarben (Bitcoin-Orange,
// Ethereum-Blau, Solana-Lila, …), die müssen stimmen, nicht zur Palette passen.
const FALLBACK_COLORS = ['#8CA277', '#CDA564', '#A9553C', '#748563', '#BF9B6E', '#6B3427', '#D4A85C', '#B9694F']

function getColor(coingeckoId: string, index: number): string {
  return COIN_COLORS[coingeckoId] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DonutEntry {
  label:        string
  coingecko_id: string
  value:        number
  pct:          number
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: DonutEntry }> }) {
  const { locale } = useSettings()
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-sm">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground tabular-nums">{d.payload.pct.toFixed(1)} % · {fmtCurrency(d.value, 'EUR', locale)}</p>
    </div>
  )
}

// ─── Single donut card ────────────────────────────────────────────────────────
export function DonutCard({
  title, subtitle, data, eurUsdRate, height = 200,
}: {
  title: string
  subtitle: string
  data: DonutEntry[]
  eurUsdRate?: number
  height?: number | `${number}%`
}) {
  const { locale } = useSettings()
  const fmtUsd = (n: number) => fmtCurrency(n, 'USD', locale)

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={65}
              outerRadius={95}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={true}
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
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
          <div key={d.coingecko_id} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getColor(d.coingecko_id, i) }}
              />
              <span className="font-medium">{d.label}</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums text-muted-foreground shrink-0">
              {eurUsdRate && (
                <span className="text-[10px] opacity-70">{fmtUsd(d.value * eurUsdRate)}</span>
              )}
              <span>{fmtCurrency(d.value, 'EUR', locale)}</span>
              <span className="opacity-60">{d.pct.toFixed(1).replace('.', ',')} %</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
