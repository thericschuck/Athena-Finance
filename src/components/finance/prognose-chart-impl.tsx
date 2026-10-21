'use client'

import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { ChartDaten, ChartPunkt } from '@/lib/forecast/chartdaten'

/**
 * Zwei Zeitreihen mit Rückblick und Ausblick: bisheriger Verlauf (Monatsenden) als durchgezogene
 * Linie, ab „Heute" die Prognose gestrichelt. Die X-Achse ist eine echte Zeitachse (siehe
 * lib/forecast/chartdaten.ts); „Heute" verbindet beide Linien, weil der Punkt beide Werte trägt.
 */

const abbr = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0))

type TipEintrag = { name: string; value: number; color: string; dataKey: string; payload: ChartPunkt }

function Tip({ active, payload, fmt, tag }: {
  active?: boolean
  payload?: TipEintrag[]
  fmt: (n: number) => string
  tag: (t: number) => string
}) {
  if (!active || !payload?.length) return null
  const punkt = payload[0].payload
  // Am Punkt „heute" tragen Verlauf und Prognose denselben Wert — nur einmal zeigen.
  const eintraege = payload.filter(p => p.value !== undefined && p.value !== null && !(p.dataKey === 'szenario' && punkt.ist !== undefined))
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-popover-foreground">{tag(punkt.t)}</p>
      {eintraege.map(p => (
        <div key={p.dataKey} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            {p.dataKey === 'szenario' && punkt.ist !== undefined ? 'Heute' : p.name}
          </span>
          <span className="font-medium tabular-nums text-popover-foreground">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Reihe({ titel, daten, heute, ticks, mitAnnahmen, farbe, nullLinie, tiefpunkt, fussnote, fmt, monat, tag }: {
  titel: string
  daten: ChartPunkt[]
  heute: number
  ticks: number[]
  mitAnnahmen: boolean
  farbe: string
  nullLinie?: boolean
  tiefpunkt?: { t: number; wert: number } | null
  fussnote: string
  fmt: (n: number) => string
  monat: (t: number) => string
  tag: (t: number) => string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{titel}</p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={daten} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            ticks={ticks} tickFormatter={monat}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false}
          />
          <YAxis tickFormatter={abbr} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip content={<Tip fmt={fmt} tag={tag} />} />
          {nullLinie && <ReferenceLine y={0} stroke="var(--chart-expense)" strokeDasharray="4 4" />}
          <ReferenceLine
            x={heute} stroke="var(--muted-foreground)" strokeOpacity={0.5}
            label={{ value: 'Heute', position: 'insideTopLeft', fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          {mitAnnahmen && (
            <Line dataKey="basis" name="Prognose ohne Annahmen" stroke="var(--muted-foreground)" strokeWidth={1.5}
              strokeDasharray="3 4" dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line dataKey="szenario" name={mitAnnahmen ? 'Prognose mit Annahmen' : 'Prognose'} stroke={farbe} strokeWidth={2.5}
            strokeDasharray="7 5" dot={{ r: 3, fill: farbe, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
          <Line dataKey="ist" name="Bisheriger Verlauf" stroke={farbe} strokeWidth={2.5}
            dot={{ r: 3, fill: farbe, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
          {tiefpunkt && (
            <ReferenceDot x={tiefpunkt.t} y={tiefpunkt.wert} r={4} fill="var(--background)" stroke={farbe} strokeWidth={2}
              label={{ value: fmt(tiefpunkt.wert), position: 'bottom', fontSize: 11, fill: 'var(--muted-foreground)' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-muted-foreground">{fussnote}</p>
    </div>
  )
}

export function PrognoseChartImpl({ daten, mitAnnahmen }: { daten: ChartDaten; mitAnnahmen: boolean }) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  // t liegt auf Mittag UTC; die Formatierung in UTC verhindert, dass eine Zeitzone den Tag verschiebt.
  const monat = (t: number) => new Date(t).toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })
  const tag = (t: number) => new Date(t).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Reihe
        titel="Liquidität" daten={daten.liquiditaet} heute={daten.heute} ticks={daten.monatsanfaenge}
        mitAnnahmen={mitAnnahmen} farbe="var(--chart-accent)" nullLinie tiefpunkt={daten.tiefpunkt}
        fussnote="Durchgezogen: Stand am Monatsende bisher. Gestrichelt: Prognose ab heute. Der Punkt markiert den tiefsten erwarteten Stand."
        fmt={fmt} monat={monat} tag={tag}
      />
      <Reihe
        titel="Nettovermögen" daten={daten.vermoegen} heute={daten.heute} ticks={daten.monatsanfaenge}
        mitAnnahmen={mitAnnahmen} farbe="var(--chart-income)"
        fussnote="Anlagen sind ein Tausch und ändern das Vermögen nicht; Kursgewinne sind nicht eingerechnet (0 %)."
        fmt={fmt} monat={monat} tag={tag}
      />
    </div>
  )
}
