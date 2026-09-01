'use client'

import { useMemo } from 'react'
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import type { SankeyData, SankeyNodeDatum } from '@/lib/analyseData'

interface Props { data: SankeyData }

// Abstufungen von --chart-expense (siehe globals.css) statt fester Terrakotta-
// Hex-Werte — zieht pro Theme-Preset mit, statt überall Aurums Palette zu
// zeigen. color-mix() erzeugt die Stufen zur Laufzeit aus der Theme-Farbe.
const EXPENSE_PALETTE = [0, 15, 30, 45, -15, -30, 60, 75].map(
  (l) => l >= 0
    ? `color-mix(in srgb, var(--chart-expense) ${100 - l}%, white ${l}%)`
    : `color-mix(in srgb, var(--chart-expense) ${100 + l}%, black ${-l}%)`,
)
// Abstufungen von --chart-income für Einkommensquellen — analog zur
// Ausgaben-Skala oben, zwei helle und zwei dunkle Varianten statt einer
// zweiten, thematisch unpassenden Goldquelle.
const INCOME_PALETTE = [0, -25, -40, 20].map(
  (l) => l >= 0
    ? `color-mix(in srgb, var(--chart-income) ${100 - l}%, white ${l}%)`
    : `color-mix(in srgb, var(--chart-income) ${100 + l}%, black ${-l}%)`,
)
const EINNAHMEN_COLOR = 'var(--chart-accent)'
const UEBERSCHUSS_COLOR = 'color-mix(in srgb, var(--chart-income) 70%, var(--chart-accent) 30%)'

/**
 * Eine Farbe je Knotenname statt getrennter Index-Logik in Node und Link —
 * garantiert, dass ein Ausgaben-Balken und sein zugehöriges Band IMMER
 * exakt denselben Ton tragen, ohne recharts' interne Sankey-Indizes/-Tiefen
 * an zwei Stellen unabhängig nachbauen zu müssen. Quellen (vor "Einnahmen"
 * in der Knotenliste) bekommen die Oliv-Skala, Ziele (danach) die Terrakotta-
 * Skala — genau die Reihenfolge, in der buildSankey() (siehe page.tsx) die
 * Knotenliste aufbaut: erst Einkommensquellen, dann "Einnahmen", dann
 * Ausgabenkategorien, optional "Überschuss".
 */
function buildNodeColorMap(nodes: SankeyNodeDatum[]): Map<string, string> {
  const map = new Map<string, string>()
  const einnahmenIdx = nodes.findIndex((n) => n.name === 'Einnahmen')
  let incomeI = 0
  let expenseI = 0
  nodes.forEach((n, i) => {
    if (n.name === 'Einnahmen') { map.set(n.name, EINNAHMEN_COLOR); return }
    if (n.name === 'Überschuss') { map.set(n.name, UEBERSCHUSS_COLOR); return }
    if (einnahmenIdx === -1 || i < einnahmenIdx) {
      map.set(n.name, INCOME_PALETTE[incomeI % INCOME_PALETTE.length])
      incomeI++
    } else {
      map.set(n.name, EXPENSE_PALETTE[expenseI % EXPENSE_PALETTE.length])
      expenseI++
    }
  })
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyNode(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, payload, colorMap } = props
  const name:  string = payload?.name  ?? ''
  const depth: number = payload?.depth ?? 0
  const color: string = colorMap?.get(name) ?? EXPENSE_PALETTE[0]

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
        fill="var(--foreground)"
        fontSize={11}
        fontFamily="inherit"
        dominantBaseline="middle"
      >
        {name}
      </text>
    </g>
  )
}

/**
 * Bänder als Farbverlauf statt Einheitsfarbe — genau wie CardSankey in der
 * "III · Die Analyse"-Sektion (siehe LandingClient.tsx): von der Farbe des
 * äußeren Endpunkts (Quelle links, Ziel rechts) zu Gold am "Einnahmen"-Knoten
 * in der Mitte. Das `<defs>` steckt bewusst IM selben Fragment wie der
 * `<path>` statt einmalig außerhalb — SVG referenziert Gradient-IDs
 * dokumentweit, die Verschachtelungsposition ist egal, und ein separates
 * `<defs>` außerhalb müsste recharts' Link-Rendering an einer Stelle
 * durchbrechen, die dafür nicht vorgesehen ist.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyLink(props: any) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload, colorMap } = props
  const sourceName: string = payload?.source?.name ?? ''
  const targetName: string = payload?.target?.name ?? ''
  const intoEinnahmen = targetName === 'Einnahmen'
  const edgeColor: string = colorMap?.get(intoEinnahmen ? sourceName : targetName) ?? EXPENSE_PALETTE[0]
  const gradId = `geldfluss-link-${sourceName.replace(/[^a-z0-9]/gi, '')}-${targetName.replace(/[^a-z0-9]/gi, '')}`

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          {intoEinnahmen ? (
            <>
              <stop offset="0%" stopColor={edgeColor} stopOpacity={0.5} />
              <stop offset="100%" stopColor={EINNAHMEN_COLOR} stopOpacity={0.32} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={EINNAHMEN_COLOR} stopOpacity={0.32} />
              <stop offset="100%" stopColor={edgeColor} stopOpacity={0.5} />
            </>
          )}
        </linearGradient>
      </defs>
      <path
        d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={linkWidth}
      />
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null

  const isLink = item.source !== undefined
  if (isLink) {
    // realValue statt value: `value` ist die auf das Sankey-Layout normierte Bandbreite,
    // bei Ausgaben also gestaucht, sobald mehr ausgegeben als eingenommen wurde. Der
    // Tooltip soll den echten Betrag nennen (siehe SankeyLinkDatum in lib/analyseData.ts).
    const betrag = (item.realValue ?? item.value) as number
    return (
      <div className="rounded-lg border border-border bg-popover shadow-lg p-2.5 text-xs">
        <p className="text-muted-foreground">{item.source?.name} → {item.target?.name}</p>
        <p className="text-popover-foreground font-semibold mt-0.5 tabular-nums">
          {Math.round(betrag).toLocaleString('de-DE')} €
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
  const colorMap = useMemo(() => buildNodeColorMap(data.nodes), [data.nodes])

  if (!data.nodes.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground">Keine Transaktionsdaten</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-medium text-foreground mb-4">Geldfluss</h2>
      <ResponsiveContainer width="100%" height={380}>
        <Sankey
          data={data}
          nodePadding={20}
          nodeWidth={14}
          margin={{ top: 12, right: 150, bottom: 12, left: 150 }}
          node={<SankeyNode colorMap={colorMap} />}
          link={<SankeyLink colorMap={colorMap} />}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}
