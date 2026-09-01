'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, Cell,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { kdeDensityAt, computePercentileRank } from '@/lib/kde'
import type { AnalyseMode, MonthSeries, MonthTotals } from '@/lib/analyseData'
import { ModeSwitch, ANALYSE_MODE_OPTIONS } from './ModeSwitch'

/** Unter dieser Monatszahl ist eine Verteilung nicht verlässlich genug — lieber
    ehrlich „noch nicht genug Historie" als ein Histogramm aus drei Werten. */
const MIN_MONTHS = 12

const TITLE: Record<AnalyseMode, string> = {
  ausgaben:  'Ausgabenverteilung',
  einnahmen: 'Einnahmenverteilung',
  guv:       'GuV-Verteilung',
}
const NOUN: Record<AnalyseMode, string> = {
  ausgaben:  'Gesamtausgaben',
  einnahmen: 'Gesamteinnahmen',
  guv:       'Einnahmen minus Ausgaben',
}
const COLOR: Record<AnalyseMode, string> = {
  ausgaben:  'var(--chart-expense)',
  einnahmen: 'var(--chart-income)',
  guv:       'var(--chart-accent)',
}

interface Props {
  history: MonthSeries
  /** `null`, solange im laufenden Monat nichts gebucht ist. */
  current: MonthTotals | null
}

interface Bin {
  label:     string
  from:      number
  to:        number
  count:     number
  /** Erwartete Monate in dieser Klasse laut KDE — siehe buildBins. */
  kurve:     number
  isCurrent: boolean
}

/** 2.340 → „2,3k", 340 → „340", −1.200 → „−1,2k" */
function compact(v: number): string {
  const abs = Math.abs(v)
  if (abs < 1000) return v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  return (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: abs >= 10000 ? 0 : 1 }) + 'k'
}

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return quantile(s, 0.5)
}

/**
 * Klassenzahl nach Freedman-Diaconis (Klassenbreite = 2·IQR/n^⅓).
 *
 * Eine feste Zahl war hier zu grob: Eric hat einzelne Ausreißermonate (ein
 * Dezember mit 3.874 € Ausgaben gegen einen Sockel um 2.000 €). Die spannen den
 * Wertebereich auf, und mit 8 festen Klassen landeten 11 von 18 Monaten in einem
 * einzigen Balken — die Verteilung war ein Klotz mit einer leeren Wüste rechts
 * daneben. FD orientiert die Breite am Interquartilsabstand, also an der Mitte
 * der Daten statt an den Rändern: derselbe Datensatz zerfällt damit in 8/6/2
 * statt 11/5/0/…, und gleichmäßige Daten bekommen weiterhin nur 6 Klassen.
 */
function binCountFor(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const iqr   = quantile(s, 0.75) - quantile(s, 0.25)
  const range = s[s.length - 1] - s[0]
  if (iqr <= 0 || range <= 0) return 6
  return Math.min(12, Math.max(6, Math.round(range / (2 * iqr / Math.cbrt(values.length)))))
}

/**
 * Klassiert die Monatswerte und legt die KDE-Kurve auf dasselbe Raster.
 *
 * `kurve` ist Dichte × Monate × Klassenbreite, also die Anzahl Monate, die man
 * in dieser Klasse ERWARTEN würde. Damit stehen Balken und Kurve auf derselben
 * Y-Achse („Monate") — eine reine Dichteachse war der Grund, warum die Y-Achse
 * vorher ausgeblendet werden musste und die Karte nicht wie ein Diagramm aussah.
 */
function buildBins(values: number[], binCount: number, currentValue: number | null): Bin[] {
  const min   = Math.min(...values)
  const max   = Math.max(...values)
  const span  = max - min || Math.abs(max) || 1
  const width = span / binCount
  // Bandbreite an die Klassenbreite gekoppelt, NICHT nach Silverman: Silverman
  // optimiert die Dichteschätzung für sich, hier muss die Kurve aber zu den
  // Balken daneben passen. Gemessen an Erics Ausreißer-Datensatz erreichte die
  // Silverman-Kurve nur 42 % der Balkenspitze — sie lag flach unter dem
  // Histogramm und sah aus wie ein Rechenfehler. Mit 0,8 × Klassenbreite sind es
  // 66-79 %: erkennbar dieselbe Verteilung, nur geglättet.
  const h     = width * 0.8

  // Liegt der laufende Monat außerhalb der Historie (neuer Höchst- oder
  // Tiefstwert), fällt er auf die Randklasse — das Perzentil im Kopf sagt mit
  // 0 bzw. 100 ohnehin deutlicher, dass er aus dem Rahmen fällt.
  const currentIdx = currentValue == null
    ? -1
    : Math.min(binCount - 1, Math.max(0, Math.floor((currentValue - min) / width)))

  return Array.from({ length: binCount }, (_, i) => {
    const last   = i === binCount - 1
    const from   = min + i * width
    // Die letzte Klasse endet exakt auf dem Maximum statt auf `from + width`:
    // bei 11 Klassen über 2.240 € liefert die Summe der Breiten durch
    // Fließkomma-Rundung 4.019,999… statt 4.020 — der teuerste Monat fiel
    // dadurch komplett aus dem Histogramm (17 von 18 Monaten gezählt).
    const to     = last ? max : from + width
    const center = from + width / 2
    return {
      label: compact(from) + '–' + compact(to),
      from,
      to,
      // Die letzte Klasse schließt oben ein, sonst fiele das Maximum durchs Raster.
      count: values.filter(v => v >= from && (last ? v <= to : v < to)).length,
      kurve: kdeDensityAt(values, center, h) * values.length * width,
      isCurrent: i === currentIdx,
    }
  })
}

/**
 * Muss außerhalb von MonatsVerteilung stehen (react-hooks/static-components):
 * eine im Render definierte Komponente wird bei jedem Durchlauf neu erzeugt und
 * verliert ihren State. `active`/`payload` schiebt recharts beim Klonen hinein,
 * `fmt` übergeben wir selbst.
 */
function BinTooltip({ active, payload, fmt }: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  const b = payload[0]?.payload as Bin | undefined
  if (!b) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg text-xs">
      <p className="text-popover-foreground font-medium tabular-nums">
        {fmt(b.from)} – {fmt(b.to)}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {b.count} {b.count === 1 ? 'Monat' : 'Monate'}
        {b.isCurrent && ' · dieser Monat liegt hier'}
      </p>
    </div>
  )
}

export function MonatsVerteilung({ history, current }: Props) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const [mode, setMode] = useState<AnalyseMode>('ausgaben')
  const values       = history[mode]
  const currentValue = current?.[mode] ?? null
  const color        = COLOR[mode]

  const binCount = useMemo(
    () => (values.length >= MIN_MONTHS ? binCountFor(values) : 6),
    [values],
  )

  const bins = useMemo(
    () => (values.length >= MIN_MONTHS ? buildBins(values, binCount, currentValue) : null),
    [values, binCount, currentValue],
  )

  if (!bins) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-sm font-medium text-foreground">{TITLE[mode]}</h2>
          <ModeSwitch value={mode} options={ANALYSE_MODE_OPTIONS} onChange={setMode} />
        </div>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Noch nicht genug Datenhistorie für eine verlässliche Verteilung
          {values.length > 0 && ` — ${values.length} von ${MIN_MONTHS} Monaten vorhanden`}.
        </p>
      </div>
    )
  }

  const med        = median(values)
  const medianBin  = bins.find(b => med >= b.from && med <= b.to)
  const percentile = currentValue != null ? computePercentileRank(values, currentValue) : null
  const countBelow = currentValue != null ? values.filter(v => v < currentValue).length : null
  // Auffällig heißt „liegt am Rand der eigenen Historie" — in beide Richtungen
  // und ohne Wertung: ein einnahmenstarker Monat ist so auffällig wie ein
  // ausgabenstarker. Als Farbe die des Modus, nicht --destructive: das ist in
  // jedem Theme byte-identisch mit --chart-expense und wäre von der Verteilung
  // selbst nicht zu unterscheiden.
  const striking = percentile != null && (percentile >= 75 || percentile <= 25)

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-medium text-foreground">{TITLE[mode]}</h2>
        <ModeSwitch value={mode} options={ANALYSE_MODE_OPTIONS} onChange={setMode} />
      </div>

      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs text-muted-foreground">
          Monate je Betragsklasse · monatliche {NOUN[mode]}, letzte {values.length} abgeschlossene Monate
        </p>
        {percentile != null && countBelow != null && (
          <p
            className="text-xs font-semibold tabular-nums"
            style={{ color: striking ? color : 'var(--muted-foreground)' }}
          >
            Dieser Monat {fmt(currentValue!)} · {percentile}. Perzentil
            <span className="font-normal"> — höher als in {countBelow} von {values.length} Monaten</span>
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={215}>
        <ComposedChart data={bins} margin={{ top: 14, right: 8, left: -22, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          {/* Ganze Monate, keine Zwischenschritte — die Achse zählt Monate. */}
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<BinTooltip fmt={fmt} />} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {bins.map(b => (
              <Cell
                key={b.label}
                // In der GuV-Ansicht trägt das Vorzeichen die Aussage: Klassen
                // bis 0 sind Verlustmonate. In den anderen Modi ist das
                // Vorzeichen konstant, da genügt die Modusfarbe.
                fill={mode === 'guv'
                  ? (b.to <= 0 ? 'var(--chart-expense)' : 'var(--chart-income)')
                  : color}
                fillOpacity={0.75}
                // Der laufende Monat wird umrandet, nicht umgefärbt — sonst wäre
                // in der GuV-Ansicht seine Vorzeichenfarbe überschrieben.
                stroke={b.isCurrent ? 'var(--foreground)' : undefined}
                strokeWidth={b.isCurrent ? 1.5 : 0}
              />
            ))}
          </Bar>
          {/* Die KDE liegt als gestrichelte Linie über den Balken: die Balken
              sind die gezählten Monate, die Kurve die geschätzte Form dahinter
              — gestrichelt, damit die beiden nicht verwechselt werden. */}
          <Area
            type="monotone"
            dataKey="kurve"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="3 3"
            fill="none"
            dot={false}
            activeDot={false}
          />
          {medianBin && (
            <ReferenceLine
              x={medianBin.label}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              label={{
                value: 'Median ' + fmt(med),
                position: 'top',
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.75 }} />
          Monate je Klasse
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
          Dichtekurve
        </span>
        {currentValue != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm border-[1.5px] border-foreground" />
            Dieser Monat
          </span>
        )}
      </div>
    </div>
  )
}
