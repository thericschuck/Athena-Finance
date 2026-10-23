'use client'

import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCurrency } from '@/lib/format'
import type { Sammlungspunkt } from '@/lib/inventar/sammlungsverlauf'

/**
 * Wert der ganzen Sammlung über die Zeit, dazu die Summe der Kaufpreise als Vergleichslinie.
 * Der Abstand zwischen beiden ist die Wertentwicklung — ohne dass man sie ausrechnen muss.
 */

const ZEITRAEUME = [
  { key: '3m',  label: '3 Mon.', monate: 3 },
  { key: '1y',  label: '1 Jahr', monate: 12 },
  { key: 'max', label: 'Alles',  monate: null },
] as const

type Zeitraum = typeof ZEITRAEUME[number]['key']

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

export default function SammlungsChart({ punkte, locale }: { punkte: Sammlungspunkt[]; locale: string }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>('max')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const daten = useMemo(() => {
    const z = ZEITRAEUME.find(x => x.key === zeitraum)!
    let liste = punkte
    if (z.monate !== null) {
      const grenze = new Date()
      grenze.setUTCMonth(grenze.getUTCMonth() - z.monate)
      const iso = grenze.toISOString().split('T')[0]
      // Der letzte Punkt VOR der Grenze bleibt dabei: sonst finge die Kurve mitten in der
      // Luft an und der gezeigte Zeitraum wuerde den ersten Wert verschweigen.
      const ab = punkte.findLastIndex(p => p.datum <= iso)
      liste = punkte.slice(Math.max(0, ab))
    }
    return liste.map(p => ({ ...p, t: tag(p.datum) }))
  }, [punkte, zeitraum])

  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )

  if (daten.length < 2) return null

  const erster = daten[0]
  const letzter = daten[daten.length - 1]
  const delta = letzter.wert - erster.wert
  const prozent = erster.wert > 0 ? (delta / erster.wert) * 100 : null

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sammlungswert im Verlauf
          </p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums tracking-tight">{euro(letzter.wert)}</span>
            <span className={`text-xs font-medium tabular-nums ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
              {delta >= 0 ? '+' : '−'}{euro(Math.abs(delta))}
              {prozent !== null && ` (${delta >= 0 ? '+' : '−'}${Math.abs(prozent).toFixed(1)} %)`}
            </span>
          </p>
        </div>

        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {ZEITRAEUME.map(z => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZeitraum(z.key)}
              aria-pressed={zeitraum === z.key}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                zeitraum === z.key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sammlung-fuellung" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity={0} />
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
              width={56}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => euro(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => datumFmt.format(Number(t))}
              formatter={(v, name) => [euro(Number(v)), name === 'wert' ? 'Wert' : 'Eingekauft']}
            />
            <Area
              type="monotone"
              dataKey="wert"
              stroke="var(--chart-accent)"
              strokeWidth={2}
              fill="url(#sammlung-fuellung)"
              dot={false}
              isAnimationActive={false}
            />
            {/* Stufenlinie: die Kaufsumme aendert sich nur an Kauftagen, nicht dazwischen. */}
            <Line
              type="stepAfter"
              dataKey="eingekauft"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Durchgezogen: geschätzter Wert · gestrichelt: Summe der Kaufpreise
      </p>
    </div>
  )
}
