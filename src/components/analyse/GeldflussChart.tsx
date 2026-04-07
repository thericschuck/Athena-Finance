'use client'

import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import type { SankeyData } from '@/lib/analyseData'

interface Props { data: SankeyData }

const EXPENSE_PALETTE = ['#f87171','#fb923c','#fbbf24','#34d399','#60a5fa','#c084fc','#f472b6','#94a3b8']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyNode(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } = props
  const name:  string = payload?.name  ?? ''
  const depth: number = payload?.depth ?? 0

  let color: string
  if      (name === 'Einnahmen') color = '#f0d98c'
  else if (name === 'Überschuss') color = '#4ade80'
  else if (depth === 0)           color = '#818cf8'   // income cats
  else                            color = EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]

  // depth 0 = leftmost (income sources) → label left; others → label right
  const isLeft = depth === 0
  const h = Math.max(height, 4)

  return (
    <g>
      <rect x={x} y={y} width={width} height={h} fill={color} fillOpacity={0.9} rx={3} />
      <text
        x={isLeft ? x - 10 : x + width + 10}
        y={y + h / 2}
        textAnchor={isLeft ? 'end' : 'start'}
        fill="#d1d5db"
        fontSize={11}
        fontFamily="inherit"
        dominantBaseline="middle"
      >
        {name}
      </text>
    </g>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null

  const isLink = item.source !== undefined
  if (isLink) {
    return (
      <div className="rounded-lg border border-border bg-popover shadow-lg p-2.5 text-xs">
        <p className="text-muted-foreground">{item.source?.name} → {item.target?.name}</p>
        <p className="text-popover-foreground font-semibold mt-0.5 tabular-nums">
          {Math.round(item.value as number).toLocaleString('de-DE')} €
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-popover shadow-lg p-2.5 text-xs">
      <p className="text-popover-foreground font-medium">{item.name}</p>
      <p className="text-muted-foreground mt-0.5 tabular-nums">
        {Math.round(item.value as number).toLocaleString('de-DE')} €
      </p>
    </div>
  )
}

export function GeldflussChart({ data }: Props) {
  if (!data.nodes.length) {
    return (
      <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5 flex items-center justify-center h-48">
        <p className="text-sm text-[#4b5563]">Keine Transaktionsdaten</p>
      </div>
    )
  }

  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      <h2 className="text-sm font-medium text-[#f3f0ea] mb-4">Geldfluss</h2>
      <ResponsiveContainer width="100%" height={380}>
        <Sankey
          data={data}
          nodePadding={20}
          nodeWidth={14}
          margin={{ top: 12, right: 150, bottom: 12, left: 150 }}
          node={<SankeyNode />}
          link={{ stroke: '#6366f1', strokeOpacity: 0.18, fill: '#6366f1', fillOpacity: 0.12 }}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}
