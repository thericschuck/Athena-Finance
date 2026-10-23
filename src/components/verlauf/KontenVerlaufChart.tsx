'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '@/lib/format'
import type { KontoPunkt } from '@/lib/verlauf/konten'

/**
 * Saldoverlauf eines einzelnen Kontos. Der Zeitraum kommt vom Server (Query-Parameter), die
 * Punkte sind dort schon gesampelt — hier wird nur gezeichnet. Linie in Kontofarbe, damit
 * sie zur Karte und zur Tabelle passt.
 */

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

export default function KontenVerlaufChart({
  punkte, farbe, locale, waehrung = 'EUR',
}: { punkte: KontoPunkt[]; farbe: string | null; locale: string; waehrung?: string }) {
  const euro = (n: number) => fmtCurrency(n, waehrung, locale, { fractionDigits: 0 })
  const daten = useMemo(() => punkte.map(p => ({ t: tag(p.datum), saldo: p.saldo })), [punkte])
  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )
  if (daten.length < 2) return null
  const linie = farbe ?? 'var(--chart-accent)'

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="konto-fuellung" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={linie} stopOpacity={0.28} />
              <stop offset="100%" stopColor={linie} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => datumFmt.format(t)}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            width={60}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => euro(v)}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={t => datumFmt.format(Number(t))}
            formatter={v => [euro(Number(v)), 'Saldo']}
          />
          <Area
            type="monotone"
            dataKey="saldo"
            stroke={linie}
            strokeWidth={2}
            fill="url(#konto-fuellung)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
