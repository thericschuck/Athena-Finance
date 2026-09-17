'use client'

// Recharts-dependent rendering split out of DepotDashboard.tsx so it can be
// loaded on demand via next/dynamic (react-doctor/prefer-dynamic-import) —
// recharts is a heavy dependency and this chart is non-critical, below-the-fold UI.

import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { PortfolioHistoryPoint } from '@/app/actions/depot'

export type ChartTab = 'Wert' | 'Anteile' | 'Cost Basis' | 'Rendite'

// ─── Formatters (kept local — tiny, chart-only) ────────────────────────────────
function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'
}
function fmtShares(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateShort(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

function yTickFmt(v: number, chartTab: ChartTab) {
  if (chartTab === 'Rendite') return v.toFixed(1) + '%'
  if (chartTab === 'Anteile') return v.toFixed(3)
  if (Math.abs(v) < 1000) return v.toFixed(0)
  // Ein Nachkommastelle nur, wenn sie gebraucht wird — sonst runden
  // benachbarte "nice" Recharts-Ticks (z. B. 1800 und 2400 bei einer
  // Spanne bis ~2300) beide auf toFixed(0) zu "2k" und die Y-Achse zeigt
  // zwei identische Beschriftungen übereinander (siehe Screenshot im Chat).
  const k = v / 1000
  return (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)) + 'k'
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label ? fmtDate(label) : ''}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-foreground">
          {p.name === 'portfolioValue' ? 'Wert: ' + fmtEur(p.value) :
           p.name === 'totalInvested'  ? 'Investiert: ' + fmtEur(p.value) :
           p.name === 'totalShares'    ? 'Anteile: ' + fmtShares(p.value) :
           p.name === 'returnPct'      ? 'Rendite: ' + fmtPct(p.value) :
           String(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────
// `height` optional, Default 220 wie zuvor (unverändertes Verhalten fürs echte
// Depot) — die Landing-Mockup-Szene (DashboardMock) braucht eine kleinere
// Höhe, weil ihr vertikales Budget durch die feste, nicht scrollende
// Mockup-Viewport-Höhe begrenzt ist.
export function DepotChart({ chartTab, history, height = 220 }: { chartTab: ChartTab; history: PortfolioHistoryPoint[]; height?: number | `${number}%` }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartTab === 'Rendite' ? (
        <LineChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => yTickFmt(v, chartTab)} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, className: 'tabular-nums' }} axisLine={false} tickLine={false} width={50} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />
          {/* Theme-Akzentfarbe statt fixem Gold — dieselbe --chart-accent-
              Variable wie Dashboard/Bank/Crypto (siehe globals.css), damit
              Depot pro Theme-Preset mitzieht statt fest auf Aurum zu zeigen. */}
          <Line type="monotone" dataKey="returnPct" stroke="var(--chart-accent)" dot={false} strokeWidth={2} />
        </LineChart>
      ) : (
        <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradValue"    x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-accent)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--chart-accent)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--chart-income)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--chart-income)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => yTickFmt(v, chartTab)} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, className: 'tabular-nums' }} axisLine={false} tickLine={false} width={50} />
          <Tooltip content={<ChartTooltip />} />
          {chartTab === 'Wert' && (
            <Area type="monotone" dataKey="portfolioValue" stroke="var(--chart-accent)" fill="url(#gradValue)" strokeWidth={2} dot={false} />
          )}
          {chartTab === 'Anteile' && (
            <Area type="monotone" dataKey="totalShares" stroke="var(--chart-accent)" fill="url(#gradValue)" strokeWidth={2} dot={false} />
          )}
          {chartTab === 'Cost Basis' && (
            <>
              <Area type="monotone" dataKey="portfolioValue" stroke="var(--chart-accent)" fill="url(#gradValue)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="totalInvested" stroke="var(--chart-income)" fill="url(#gradInvested)" strokeWidth={2} dot={false} />
            </>
          )}
        </AreaChart>
      )}
    </ResponsiveContainer>
  )
}
