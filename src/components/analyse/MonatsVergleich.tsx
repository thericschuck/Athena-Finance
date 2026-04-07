'use client'

import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyComparison } from '@/lib/analyseData'

interface Props { data: MonthlyComparison[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value

  return (
    <div className="rounded-lg border border-[#1e2130] bg-[#0d0f14] p-3 shadow-xl text-xs min-w-[148px]">
      <p className="font-semibold text-[#f3f0ea] mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[#6b7280]">Einnahmen</span>
          <span className="text-[#4ade80] font-medium tabular-nums">
            {(get('einnahmen') as number)?.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#6b7280]">Ausgaben</span>
          <span className="text-[#f87171] font-medium tabular-nums">
            {(get('ausgaben') as number)?.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-[#1e2130]">
          <span className="text-[#6b7280]">Sparquote</span>
          <span className="text-[#f0d98c] font-semibold">{get('sparquote')} %</span>
        </div>
      </div>
    </div>
  )
}

export function MonatsVergleich({ data }: Props) {
  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[#f3f0ea]">Monatlicher Vergleich</h2>
        <div className="flex items-center gap-4 text-[10px] text-[#6b7280]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4ade80] opacity-80" />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f87171] opacity-80" />
            Ausgaben
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5 bg-[#f0d98c]" />
            Sparquote
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="eur"
            tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            domain={[0, 60]}
            width={36}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: '#1e2130', fillOpacity: 0.5 }}
          />
          <Bar
            yAxisId="eur"
            dataKey="einnahmen"
            fill="#4ade80"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            yAxisId="eur"
            dataKey="ausgaben"
            fill="#f87171"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="sparquote"
            stroke="#f0d98c"
            strokeWidth={2}
            dot={{ fill: '#f0d98c', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#f0d98c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
