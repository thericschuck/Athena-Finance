'use client'

import { useMemo, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { tooltipSortierer } from '@/lib/chart-reihenfolge'
import type { TempoArt, TempoReihe } from '@/lib/analyse/tempo'

/**
 * „Tempo diesen Monat": kumulierte Ausgaben (oder Einnahmen) des laufenden Monats als Linie gegen
 * den Schnitt der letzten abgeschlossenen Monate, dazu ein Band von dem Monat mit dem niedrigsten
 * bis zu dem mit dem hoechsten Stand am jeweiligen Tag. Die Reihen kommen fertig vom Server
 * (AnalyseTempo.tsx); hier wird nur gezeichnet. Mit Recharts, deshalb nur ueber
 * AnalyseTempoChartLazy laden.
 *
 * Reihenfolge in Legende und Tooltip ist dieselbe (lib/chart-reihenfolge.ts): diesen Monat,
 * Schnitt, Spanne.
 */

const REIHENFOLGE = ['aktuell', 'schnitt', 'band']
const LABEL: Record<string, string> = { aktuell: 'Dieser Monat', schnitt: 'Schnitt', band: 'Spanne' }

const FARBE: Record<TempoArt, string> = { ausgaben: 'var(--chart-expense)', einnahmen: 'var(--chart-income)' }

interface Props {
  reihen: Record<TempoArt, TempoReihe | null>
  locale: string
}

export default function AnalyseTempoChart({ reihen, locale }: Props) {
  const verfuegbar = (['ausgaben', 'einnahmen'] as const).filter(a => reihen[a] !== null)
  const [art, setArt] = useState<TempoArt>(verfuegbar[0] ?? 'ausgaben')
  const reihe = reihen[art]

  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  // Achsenbeschriftung kompakt (1,2 Tsd. €), damit auf 360 px Breite genug Platz fuer den Chart bleibt.
  const kompakt = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    [locale],
  )

  const daten = useMemo(
    () => (reihe ? reihe.punkte.map(p => ({ ...p, band: [p.min, p.max] as [number, number] })) : []),
    [reihe],
  )
  const ticks = useMemo(() => {
    const n = reihe?.punkte.length ?? 30
    return [1, 8, 15, 22, 29].filter(t => t <= n)
  }, [reihe])

  if (!reihe) return null

  const farbe = FARBE[art]
  const abw = reihe.abweichung
  const gleich = Math.abs(abw) < 1
  // Bei Ausgaben ist „darueber" schlecht, bei Einnahmen gut.
  const gut = art === 'ausgaben' ? abw < 0 : abw > 0
  const wort = abw > 0 ? 'über' : 'unter'

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xl font-semibold tabular-nums tracking-tight ${
            gleich ? '' : gut ? 'text-success' : 'text-danger'
          }`}>
            {gleich ? 'Im Schnitt' : `${euro(Math.abs(abw))} ${wort} dem Schnitt`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Stand Tag {reihe.heuteTag}: {euro(reihe.aktuellHeute)} · Schnitt {euro(reihe.schnittHeute)}
          </p>
        </div>
        {verfuegbar.length > 1 && (
          <div role="group" aria-label="Art" className="inline-flex rounded-md bg-muted p-0.5">
            {verfuegbar.map(a => (
              <button
                key={a}
                type="button"
                aria-pressed={art === a}
                onClick={() => setArt(a)}
                className={`min-h-10 rounded px-3 text-xs font-medium transition-colors sm:min-h-8 ${
                  art === a ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {a === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 h-48 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daten} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tag"
              type="number"
              domain={[1, reihe.punkte.length]}
              ticks={ticks}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={40}
              tickCount={4}
              domain={[0, 'auto']}
              tickFormatter={(v: number) => kompakt.format(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => `Tag ${t}`}
              itemSorter={tooltipSortierer(REIHENFOLGE)}
              formatter={(v, name) => {
                const n = String(name)
                if (Array.isArray(v)) return [`${euro(Number(v[0]))} – ${euro(Number(v[1]))}`, LABEL[n] ?? n]
                return [euro(Number(v)), LABEL[n] ?? n]
              }}
            />
            <ReferenceLine x={reihe.heuteTag} stroke="var(--muted-foreground)" strokeDasharray="2 3" strokeOpacity={0.6} />
            {/* Zeichenreihenfolge: Band zuerst (liegt hinten), dann Schnitt, zuletzt die Linie dieses Monats. */}
            <Area
              dataKey="band" name="band" type="monotone"
              stroke="none" fill="var(--chart-muted-1)" fillOpacity={0.22}
              isAnimationActive={false} activeDot={false}
            />
            <Line
              dataKey="schnitt" name="schnitt" type="monotone"
              stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} isAnimationActive={false}
            />
            <Line
              dataKey="aktuell" name="aktuell" type="monotone"
              stroke={farbe} strokeWidth={2.5}
              dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {REIHENFOLGE.map(k => (
          <li key={k} className="flex items-center gap-1.5">
            {k === 'aktuell' && <span className="h-0.5 w-3 rounded" style={{ background: farbe }} aria-hidden />}
            {k === 'schnitt' && <span className="h-0 w-3 border-t border-dashed border-muted-foreground" aria-hidden />}
            {k === 'band' && <span className="size-2.5 rounded-sm bg-[var(--chart-muted-1)] opacity-40" aria-hidden />}
            {k === 'band'
              ? `Spanne der letzten ${reihe.vormonate.length} Monate (niedrigster bis höchster)`
              : k === 'schnitt'
                ? `Schnitt der letzten ${reihe.vormonate.length} Monate`
                : LABEL[k]}
          </li>
        ))}
      </ul>
    </div>
  )
}
