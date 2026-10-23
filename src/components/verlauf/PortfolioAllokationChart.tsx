'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
import type { Reihe } from '@/lib/verlauf/portfolio'

/**
 * Allokation im Zeitverlauf: Wert je Asset gestapelt. Die Gruppierung (Top 5 + „Weitere")
 * und die Tagesaggregation passieren auf dem Server in lib/verlauf/portfolio.ts — hier
 * kommt nur noch fertige, flache Zeilen an.
 */

export interface AllokationPunkt {
  /** YYYY-MM-DD */
  datum: string
  /** Wert in EUR je Reihen-Key. */
  werte: Record<string, number>
}

type Modus = 'absolut' | 'anteil'

const farbe = (i: number) => `var(--chart-cat-${i + 1})`
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

export default function PortfolioAllokationChart({
  punkte, reihen, locale,
}: { punkte: AllokationPunkt[]; reihen: Reihe[]; locale: string }) {
  const [modus, setModus] = useState<Modus>('absolut')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  // „Anteil" wird selbst gerechnet statt per stackOffset="expand": so zeigt der Tooltip
  // echte Prozentwerte statt der 0–1-Brueche, und die Achse bleibt exakt 0–100.
  const daten = useMemo(
    () =>
      punkte.map(p => {
        const s = Object.values(p.werte).reduce((a, b) => a + b, 0)
        const zeile: Record<string, number> = { t: tag(p.datum), summe: s }
        for (const r of reihen) {
          const v = p.werte[r.key] ?? 0
          zeile[r.key] = modus === 'anteil' ? (s > 0 ? (v / s) * 100 : 0) : v
        }
        return zeile
      }),
    [punkte, reihen, modus],
  )

  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )
  const labelVon = (key: string) => reihen.find(r => r.key === key)?.label ?? key
  const prozent = (n: number) => `${n.toFixed(1)} %`
  // Gestapelt: die letzte Reihe liegt oben. Legende und Tooltip führen sie oben zuerst.
  const reihenfolge = useMemo(() => anzeigeReihenfolge(reihen.map(r => r.key)), [reihen])

  if (punkte.length < 2) {
    return (
      <p className="rounded-lg border border-border bg-card px-5 py-4 text-xs text-muted-foreground">
        Für den Verlauf braucht es mindestens zwei Tage mit Snapshots im gewählten Zeitraum.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Allokation im Zeitverlauf
        </p>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Darstellung">
          {([['absolut', 'Absolut'], ['anteil', 'Anteil in %']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModus(k)}
              aria-pressed={modus === k}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                modus === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
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
              domain={modus === 'anteil' ? [0, 100] : [0, 'auto']}
              tickFormatter={(v: number) => (modus === 'anteil' ? `${Math.round(v)} %` : euro(v))}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => datumFmt.format(Number(t))}
              itemSorter={tooltipSortierer(reihenfolge)}
              formatter={(v, name) => [modus === 'anteil' ? prozent(Number(v)) : euro(Number(v)), labelVon(String(name))]}
            />
            {reihen.map((r, i) => (
              <Area
                key={r.key}
                type="monotone"
                dataKey={r.key}
                stackId="allokation"
                stroke={farbe(i)}
                strokeWidth={1.5}
                fill={farbe(i)}
                fillOpacity={0.35}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {reihenfolge.map(key => {
          const i = reihen.findIndex(r => r.key === key)
          return (
            <li key={key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: farbe(i) }} />
              {labelVon(key)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
