'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { CategoryDatum } from '@/lib/analyseData'

interface Props { data: CategoryDatum[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]?.payload as CategoryDatum
  const isIncome = value >= 0
  return (
    <div className="rounded-lg border border-[#1e2130] bg-[#0d0f14] p-2.5 shadow-xl text-xs">
      <p className="text-[#d1d5db] font-medium mb-0.5">{name}</p>
      <p className={`font-semibold tabular-nums ${isIncome ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
        {isIncome ? '+' : ''}{Math.abs(value).toLocaleString('de-DE')} €
      </p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomYAxisTick({ x, y, payload }: any) {
  return (
    <text x={x - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">
      {payload.value}
    </text>
  )
}

export function KategorienChart({ data }: Props) {
  // Sort: income desc at top, expenses desc (most negative at bottom)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const maxAbs  = Math.max(...sorted.map(d => Math.abs(d.value)))
  const domain  = [-maxAbs * 1.1, maxAbs * 1.1]

  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-[#f3f0ea]">Einnahmen & Ausgaben nach Kategorie</h2>
        <div className="flex items-center gap-4 text-[10px] text-[#6b7280]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4ade80] opacity-75" />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f87171] opacity-75" />
            Ausgaben
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={sorted.length * 36 + 24}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" horizontal={false} />
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={v => `${Math.round(Math.abs(v as number) / 1000 * 10) / 10}k`}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={<CustomYAxisTick />}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="#2d3148" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e2130', fillOpacity: 0.5 }} />
          <Bar dataKey="value" radius={4} maxBarSize={22}>
            {sorted.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.value >= 0 ? '#4ade80' : '#f87171'}
                fillOpacity={0.78}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
