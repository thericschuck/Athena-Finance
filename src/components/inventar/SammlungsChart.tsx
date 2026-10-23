'use client'

import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { kategorieLabel } from '@/lib/valuables'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
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

type Ansicht = 'gesamt' | 'kategorie'

/** Themefarben fuer Kategorien (`--chart-cat-1…6`). Die sechste gehoert zu „Weitere". */
const MAX_KATEGORIEN = 5
const WEITERE = 'weitere'
const kategorieFarbe = (i: number) => `var(--chart-cat-${i + 1})`

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

export default function SammlungsChart({ punkte, locale }: { punkte: Sammlungspunkt[]; locale: string }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>('max')
  const [ansicht, setAnsicht] = useState<Ansicht>('gesamt')
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

  // Kategorien nach ihrem heutigen Wert, groesste zuerst (unterste Schicht). Mehr als fuenf
  // werden zu „Weitere" zusammengefasst — sechs Farben sind lesbar, dreizehn nicht.
  const schichten = useMemo(() => {
    const heute = punkte[punkte.length - 1]?.kategorien ?? {}
    const alle = new Set<string>()
    for (const p of punkte) for (const k of Object.keys(p.kategorien)) alle.add(k)
    const sortiert = [...alle].sort((a, b) => (heute[b] ?? 0) - (heute[a] ?? 0))
    const oben = sortiert.slice(0, MAX_KATEGORIEN)
    const rest = sortiert.slice(MAX_KATEGORIEN)
    return {
      keys: rest.length > 0 ? [...oben, WEITERE] : oben,
      rest: new Set(rest),
    }
  }, [punkte])

  const geschichtet = useMemo(
    () =>
      daten.map(p => {
        const zeile: Record<string, number> = {}
        for (const [k, v] of Object.entries(p.kategorien)) {
          const key = schichten.rest.has(k) ? WEITERE : k
          zeile[key] = (zeile[key] ?? 0) + v
        }
        return { ...p, ...zeile }
      }),
    [daten, schichten],
  )
  // Gestapelt: die zuletzt gezeichnete Kategorie liegt oben. Legende und Tooltip führen sie
  // oben zuerst; die Kaufpreis-Linie (Hilfslinie) kommt dahinter.
  const reihenfolge = useMemo(() => anzeigeReihenfolge(schichten.keys), [schichten])
  const schichtLabel = (k: string) => (k === WEITERE ? 'Weitere' : kategorieLabel(k))

  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )

  if (daten.length < 2) return null

  const erster = daten[0]
  const letzter = daten[daten.length - 1]
  // Entwicklung um Zukaeufe bereinigt: ohne das waere „+530 %" nur der Effekt, dass die
  // Kurve mit EINEM Stueck beginnt und spaeter weitere dazukommen. Gerechnet wird der
  // Wertzuwachs abzueglich dessen, was seitdem dazugekauft wurde, bezogen auf das
  // eingesetzte Kapital (Startwert plus Zukaeufe).
  const zukauf = letzter.eingekauft - erster.eingekauft
  const delta = letzter.wert - erster.wert - zukauf
  const basis = erster.wert + zukauf
  const prozent = basis > 0 ? (delta / basis) * 100 : null

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

        <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Darstellung">
          {([['gesamt', 'Gesamt'], ['kategorie', 'Nach Kategorie']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAnsicht(k)}
              aria-pressed={ansicht === k}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                ansicht === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
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
      </div>

      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={ansicht === 'kategorie' ? geschichtet : daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
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
              itemSorter={tooltipSortierer(reihenfolge)}
              formatter={(v, name) => [
                euro(Number(v)),
                name === 'wert' ? 'Wert' : name === 'eingekauft' ? 'Eingekauft' : schichtLabel(String(name)),
              ]}
            />
            {ansicht === 'gesamt' ? (
              <Area
                type="stepAfter"
                dataKey="wert"
                stroke="var(--chart-accent)"
                strokeWidth={2}
                fill="url(#sammlung-fuellung)"
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              schichten.keys.map((k, i) => (
                <Area
                  key={k}
                  type="stepAfter"
                  dataKey={k}
                  stackId="kategorie"
                  stroke={kategorieFarbe(i)}
                  strokeWidth={1.5}
                  fill={kategorieFarbe(i)}
                  fillOpacity={0.35}
                  dot={false}
                  isAnimationActive={false}
                />
              ))
            )}
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

      {ansicht === 'kategorie' ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {reihenfolge.map(k => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: kategorieFarbe(schichten.keys.indexOf(k)) }} />
              {schichtLabel(k)}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-muted-foreground" />
            Summe der Kaufpreise
          </li>
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Durchgezogen: geschätzter Wert · gestrichelt: Summe der Kaufpreise
        </p>
      )}
    </div>
  )
}
