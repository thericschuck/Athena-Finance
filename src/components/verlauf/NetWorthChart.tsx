'use client'

import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCurrency } from '@/lib/format'
import type { LinienPunkt, NetWorthPunkt, ProjektionPunkt, Zeitraum } from '@/lib/verlauf/types'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
import { ZEITRAEUME } from '@/lib/verlauf/types'
import {
  SCHULDEN, aenderung, baueZeilen, filterZeitraum, toepfeSchichten,
} from '@/lib/verlauf/chart-daten'

/**
 * Net Worth im Verlauf: Gesamt als Flaeche oder nach Topf gestapelt (Schulden als rote
 * Schicht unter der Nulllinie), optional mit Prognose, Inventar-Linie und Meilensteinen.
 * Snapshots sind taeglich, daher `monotone` statt Stufen (anders als beim Sammlungswert).
 */

const ZEITRAUM_LABEL: Record<Zeitraum, string> = {
  '1m': '1M', '3m': '3M', '6m': '6M', '1y': '1J', ytd: 'YTD', max: 'Max',
}

type Ansicht = 'gesamt' | 'topf'

const topfFarbe = (i: number) => `var(--chart-cat-${i + 1})`

const schalter = (aktiv: boolean) =>
  `rounded px-2 py-1 text-xs transition-colors ${
    aktiv ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
  }`

interface Props {
  punkte: NetWorthPunkt[]
  locale: string
  sammlung?: LinienPunkt[]
  projektion?: ProjektionPunkt[]
  meilensteine?: number[]
}

export default function NetWorthChart({ punkte, locale, sammlung, projektion, meilensteine }: Props) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>('max')
  const [ansicht, setAnsicht] = useState<Ansicht>('gesamt')
  const [zeigeProjektion, setZeigeProjektion] = useState(true)
  const [zeigeSammlung, setZeigeSammlung] = useState(false)

  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const hatProjektion = (projektion?.length ?? 0) > 0
  const hatSammlung = (sammlung?.length ?? 0) > 0

  const { schichten, rest } = useMemo(() => toepfeSchichten(punkte), [punkte])
  const hatSchulden = useMemo(() => punkte.some(p => p.total_debts > 0), [punkte])

  // Eine Liste fuer Legende UND Tooltip, oben zuerst (siehe lib/chart-reihenfolge.ts). Die
  // Schulden liegen als eigene Schicht unter der Nulllinie und stehen damit ganz unten.
  const reihenfolge = useMemo(
    () => [
      ...anzeigeReihenfolge(schichten.map(s => s.key)),
      ...(hatSchulden ? [SCHULDEN] : []),
    ],
    [schichten, hatSchulden],
  )

  const sichtbar = useMemo(() => filterZeitraum(punkte, zeitraum, new Date()), [punkte, zeitraum])
  const zeilen = useMemo(
    () => baueZeilen(sichtbar, rest, zeigeSammlung ? sammlung : [], zeigeProjektion ? projektion : []),
    [sichtbar, rest, sammlung, projektion, zeigeSammlung, zeigeProjektion],
  )

  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )

  if (sichtbar.length < 2) return null

  const erster = sichtbar[0]
  const letzter = sichtbar[sichtbar.length - 1]
  const { delta, prozent } = aenderung(erster.net_worth, letzter.net_worth)
  const vz = delta >= 0 ? '+' : '−'

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Net Worth</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums tracking-tight">{euro(letzter.net_worth)}</span>
            <span className={`text-xs font-medium tabular-nums ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
              {vz}{euro(Math.abs(delta))}
              {prozent !== null && ` (${vz}${Math.abs(prozent).toFixed(1)} %)`}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Darstellung">
            {([['gesamt', 'Gesamt'], ['topf', 'Nach Topf']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setAnsicht(k)}
                aria-pressed={ansicht === k} className={schalter(ansicht === k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
            {ZEITRAEUME.map(z => (
              <button key={z} type="button" onClick={() => setZeitraum(z)}
                aria-pressed={zeitraum === z} className={schalter(zeitraum === z)}>
                {ZEITRAUM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(hatProjektion || hatSammlung) && (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Zusatzlinien">
          {hatProjektion && (
            <button type="button" onClick={() => setZeigeProjektion(v => !v)}
              aria-pressed={zeigeProjektion}
              className={`rounded-md border border-border ${schalter(zeigeProjektion)}`}>
              Prognose
            </button>
          )}
          {hatSammlung && (
            <button type="button" onClick={() => setZeigeSammlung(v => !v)}
              aria-pressed={zeigeSammlung}
              className={`rounded-md border border-border ${schalter(zeigeSammlung)}`}>
              Inventar einblenden
            </button>
          )}
        </div>
      )}

      <div className="mt-3 h-56 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={zeilen} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="networth-fuellung" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => datumFmt.format(t)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false} minTickGap={40}
            />
            <YAxis
              width={56} domain={['auto', 'auto']}
              tickFormatter={(v: number) => euro(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => datumFmt.format(Number(t))}
              itemSorter={tooltipSortierer([...reihenfolge, 'projektion', 'projektionBand', 'sammlung'])}
              formatter={(v, name) => [
                // Der Prognosebereich kommt als [unten, oben].
                Array.isArray(v) ? `${euro(Number(v[0]))} – ${euro(Number(v[1]))}` : euro(Number(v)),
                String(name),
              ]}
            />
            {ansicht === 'gesamt' ? (
              <Area
                type="monotone" dataKey="net_worth" name="Net Worth"
                stroke="var(--chart-accent)" strokeWidth={2} fill="url(#networth-fuellung)"
                dot={false} isAnimationActive={false}
              />
            ) : (
              <>
                {schichten.map((s, i) => (
                  <Area
                    key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="topf"
                    stroke={topfFarbe(i)} strokeWidth={1.5} fill={topfFarbe(i)} fillOpacity={0.35}
                    dot={false} isAnimationActive={false}
                  />
                ))}
                {hatSchulden && (
                  <Area
                    type="monotone" dataKey={SCHULDEN} name="Schulden" stackId="schulden"
                    stroke="var(--chart-expense)" strokeWidth={1.5} fill="var(--chart-expense)" fillOpacity={0.35}
                    dot={false} isAnimationActive={false}
                  />
                )}
              </>
            )}
            {zeigeProjektion && hatProjektion && (
              <Area
                type="monotone" dataKey="projektionBand" name="Prognose-Bereich (80 %)"
                stroke="none" fill="var(--chart-accent)" fillOpacity={0.12}
                dot={false} activeDot={false} isAnimationActive={false}
              />
            )}
            {zeigeProjektion && hatProjektion && (
              <Line
                type="monotone" dataKey="projektion" name="Prognose" connectNulls
                stroke="var(--chart-accent)" strokeWidth={1.5} strokeDasharray="5 4"
                dot={false} isAnimationActive={false}
              />
            )}
            {zeigeSammlung && hatSammlung && (
              <Line
                type="monotone" dataKey="sammlung" name="Inventar" connectNulls
                stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3"
                dot={false} isAnimationActive={false}
              />
            )}
            {/* hidden: ein weit entfernter Meilenstein soll die Y-Achse nicht stauchen. */}
            {meilensteine?.map(m => (
              <ReferenceLine
                key={m} y={m} ifOverflow="hidden"
                stroke="var(--muted-foreground)" strokeDasharray="2 4"
                label={{ value: euro(m), position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legende">
        {ansicht === 'gesamt' ? (
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: 'var(--chart-accent)' }} />
            Net Worth
          </li>
        ) : (
          <>
            {/* Gleiche Reihenfolge wie der Tooltip: oben zuerst. Die Farbe haengt am Index in
                der Zeichenreihenfolge, nicht an der Anzeigeposition. */}
            {[...schichten.entries()].reverse().map(([i, s]) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: topfFarbe(i) }} />
                {s.label}
              </li>
            ))}
            {hatSchulden && (
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: 'var(--chart-expense)' }} />
                Schulden
              </li>
            )}
          </>
        )}
        {zeigeProjektion && hatProjektion && (
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed" style={{ borderColor: 'var(--chart-accent)' }} />
            Prognose (mit 80-%-Bereich)
          </li>
        )}
        {zeigeSammlung && hatSammlung && (
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-muted-foreground" />
            Inventar (nicht im Net Worth enthalten)
          </li>
        )}
      </ul>
    </div>
  )
}
