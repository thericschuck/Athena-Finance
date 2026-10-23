'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
import type { BewegungMonat } from '@/lib/verlauf/bewegung'

// Zeichenreihenfolge unten -> oben; der Tooltip führt sie oben zuerst, wie man sie sieht.
const REIHENFOLGE = anzeigeReihenfolge(['gespart', 'markt'])

/**
 * Gestapelte Monatsbalken: gespart und Markt/Rest. Positive und negative Anteile stapeln
 * in Recharts getrennt nach oben bzw. unten, die Nulllinie bleibt die gemeinsame Basis.
 */
export default function BewegungsChart({ monate, locale }: { monate: BewegungMonat[]; locale: string }) {
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const monatFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )
  const label = (iso: string) => monatFmt.format(new Date(`${iso}T00:00:00Z`))

  return (
    <div className="mt-3 h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monate} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={label}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            width={56}
            tickFormatter={(v: number) => euro(v)}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(m) => label(String(m))}
            itemSorter={tooltipSortierer(REIHENFOLGE)}
            formatter={(v, name) => [euro(Number(v)), name === 'gespart' ? 'Gespart' : 'Markt & Sonstiges']}
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
          <Bar dataKey="gespart" stackId="b" fill="var(--chart-cat-1)" isAnimationActive={false} />
          <Bar dataKey="markt" stackId="b" fill="var(--chart-cat-2)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
