'use client'

import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { fmtCurrency } from '@/lib/format'

/**
 * Die Ringe sind genau die Bausteine des Nettovermögens — dieselben vier, die die
 * Net-Worth-Kachel untereinander auflistet, in derselben Reihenfolge.
 *
 * Vorher war „Sparziele" ein fünfter Ring. Damit summierte die Mitte des Rings
 * 15.158,61 € gegen 13.548,61 € in der Kachel daneben: die 1.610 € des Sparziels
 * „China Reise" liegen auf dem Girokonto und waren im Ring doppelt drin. Sparziele
 * sind per Entscheidung vom 2026-09-02 kein Vermögensposten (siehe Kommentar zu
 * `netWorth` in dashboard/page.tsx), also gehören sie hier nicht rein.
 */
const SLICES = [
  { key: 'Konten',          color: 'var(--chart-cat-1)' },
  { key: 'Geschäftsanteile', color: 'var(--chart-cat-4)' },
  { key: 'Depot',           color: 'var(--chart-cat-2)' },
  { key: 'Krypto',          color: 'var(--chart-cat-3)' },
]

type Props = {
  /** Giro, Spar, Cash, Bausparer — ohne Geschäftsanteile. */
  kontenTotal:     number
  investmentTotal: number
  depotTotal:      number
  cryptoTotal:     number
  locale:          string
}

export function PortfolioDonut({
  kontenTotal, investmentTotal, depotTotal, cryptoTotal, locale,
}: Props) {
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)

  const data = [
    { ...SLICES[0], value: kontenTotal     },
    { ...SLICES[1], value: investmentTotal },
    { ...SLICES[2], value: depotTotal      },
    { ...SLICES[3], value: cryptoTotal     },
  ].filter(d => d.value > 0)

  // Die Mitte zeigt die Summe der Ringe. Weil die Ringe jetzt genau die
  // Net-Worth-Bausteine sind, ist das dieselbe Zahl wie in der Kachel — und kann
  // nicht mehr auseinanderlaufen, ohne dass ein Ring fehlt.
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Portfolio-Verteilung</p>

      <div className="flex flex-col items-center gap-5">
        {/* Donut */}
        <div className="relative w-36 h-36 shrink-0">
          <PieChart width={144} height={144}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={64}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip
                formatter={(val: number | undefined) => [fmt(val ?? 0), '' as const]}
                // `color` muss mit: contentStyle setzte nur den Hintergrund, und
                // recharts schreibt die Textfarbe als Inline-Style auf den Eintrag.
                // Im dunklen Theme stand damit dunkler Text auf --card, also
                // schwarz auf schwarz.
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--popover-foreground)',
                }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
                labelStyle={{ display: 'none' }}
              />
            </PieChart>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] text-muted-foreground">Gesamt</p>
            <p className="text-sm font-bold tabular-nums leading-tight">
              {total >= 100_000
                ? `${(total / 1000).toFixed(0)}k`
                : fmt(total).replace(' €', '€')}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-2">
          {data.map(item => {
            const pct = Math.round((item.value / total) * 100)
            return (
              <div key={item.key} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-muted-foreground flex-1">{item.key}</span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
                <span className="text-xs font-semibold tabular-nums">{fmt(item.value)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
