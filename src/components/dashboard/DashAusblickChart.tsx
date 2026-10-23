'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { tooltipSortierer } from '@/lib/chart-reihenfolge'
import {
  AUSBLICK_STANDARD, AUSBLICK_ZEITRAEUME, ausblickSatz, bewerteAusblick, fensterPunkte, kurzDatum, tiefpunkte,
  type AusblickPunkt, type AusblickStufe, type AusblickZeitraum,
} from '@/lib/dashboard/ausblick'

/**
 * Kleiner Liquiditätsausblick: erwartete Kurve mit 80-%-Bereich, Tiefpunkt markiert, Kernaussage
 * mit Ampelfarbe in der Kopfzeile. Der Look folgt dem grossen Prognose-Chart (Bereichsfläche
 * hinter der Linie, gestrichelte Nulllinie, Tooltip erwartet vor Bereich).
 *
 * Tippen funktioniert wie Hover: Recharts zeigt den Tooltip auch bei Touch.
 */

const FARBE: Record<AusblickStufe, { text: string; chart: string; punkt: string }> = {
  ok:    { text: 'text-success', chart: 'var(--chart-income)',  punkt: 'bg-success' },
  knapp: { text: 'text-warning', chart: 'var(--warning)',       punkt: 'bg-warning' },
  minus: { text: 'text-danger',  chart: 'var(--chart-expense)', punkt: 'bg-danger' },
}

/** Tooltip-Reihenfolge: erwartete Linie zuerst, dann der Bereich (wie auf der Prognose-Seite). */
const TIP_REIHENFOLGE = ['e', 'band']

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

export default function DashAusblickChart({ punkte, heute, locale, dateFormat }: {
  punkte: AusblickPunkt[]; heute: string; locale: string; dateFormat: string
}) {
  const [zeitraum, setZeitraum] = useState<AusblickZeitraum>(AUSBLICK_STANDARD)
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const datum = (iso: string) => kurzDatum(iso, dateFormat)

  const daten = useMemo(
    () => fensterPunkte(punkte, heute, zeitraum).map(p => ({ ...p, t: tag(p.d), band: [p.u, p.o] as [number, number] })),
    [punkte, heute, zeitraum],
  )
  const tp = useMemo(() => tiefpunkte(daten), [daten])
  if (!tp) return null

  const stufe = bewerteAusblick(tp.erwartet.betrag, tp.risiko.betrag)
  const farbe = FARBE[stufe]
  const mitMinus = tp.risiko.betrag < 0
  const achsenFmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' })

  return (
    <div className="flex min-h-[260px] flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ausblick Liquidität
        </p>
        <div className="flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {AUSBLICK_ZEITRAEUME.map(z => (
            <button
              key={z}
              type="button"
              onClick={() => setZeitraum(z)}
              aria-pressed={zeitraum === z}
              // 40 px Tap-Ziel auf dem Handy, schmaler am Desktop.
              className={`h-10 min-w-10 rounded px-2 text-xs transition-colors sm:h-7 ${
                zeitraum === z ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {z} T.
            </button>
          ))}
        </div>
      </div>

      <p className={`mt-1 flex items-start gap-2 text-sm font-medium leading-snug ${farbe.text}`}>
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${farbe.punkt}`} aria-hidden />
        <span className="min-w-0">{ausblickSatz(tp, stufe, euro, datum)}</span>
      </p>

      <div className="mt-2 h-32 w-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daten} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => achsenFmt.format(t)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false} minTickGap={36}
            />
            <YAxis
              width={44} domain={['auto', 'auto']} tickCount={3}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={t => achsenFmt.format(Number(t))}
              itemSorter={tooltipSortierer(TIP_REIHENFOLGE)}
              formatter={(v, name) => {
                if (name === 'band' && Array.isArray(v)) return [`${euro(Number(v[0]))} bis ${euro(Number(v[1]))}`, '80-%-Bereich']
                return [euro(Number(v)), 'Erwartet']
              }}
            />
            {mitMinus && <ReferenceLine y={0} stroke="var(--chart-expense)" strokeDasharray="4 4" />}
            <Area dataKey="band" name="band" stroke="none" fill={farbe.chart} fillOpacity={0.14} isAnimationActive={false} />
            <Line
              dataKey="e" name="e" stroke={farbe.chart} strokeWidth={2} dot={false}
              activeDot={{ r: 4 }} isAnimationActive={false}
            />
            <ReferenceDot
              x={tag(tp.erwartet.datum)} y={tp.erwartet.betrag} r={4}
              fill="var(--background)" stroke={farbe.chart} strokeWidth={2} ifOverflow="visible"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">Linie: erwartet · Fläche: 80-%-Bereich</span>
        <Link
          href="/finance/prognose"
          className="inline-flex min-h-10 shrink-0 items-center text-xs font-medium text-primary hover:underline"
        >
          Zur Prognose →
        </Link>
      </div>
    </div>
  )
}
