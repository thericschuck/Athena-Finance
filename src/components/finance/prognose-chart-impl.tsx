'use client'

import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { tooltipSortierer } from '@/lib/chart-reihenfolge'
import type { ChartDaten, ChartPunkt } from '@/lib/forecast/chartdaten'

/**
 * Prognose-Kurve: bisheriger Verlauf als durchgezogene Linie, ab „Heute“ die Prognose gestrichelt,
 * dazu der 80-%-Schwankungsbereich als Band. Eine Kurve zur Zeit (Liquidität | Vermögen) statt zweier
 * untereinander: am Handy bleibt so Platz für die Kurve selbst. Die X-Achse ist eine echte Zeitachse
 * (siehe lib/forecast/chartdaten.ts).
 *
 * Breite: der Container ist `min-w-0` und der Chart füllt ihn zu 100 %, damit nichts über den
 * Bildschirmrand ragt (360 px).
 */

// Legende UND Tooltip führen die Serien in dieser Reihenfolge (lib/chart-reihenfolge.ts):
// Hauptserien zuerst, Hilfslinie und Band dahinter.
const REIHENFOLGE = ['ist', 'szenario', 'basis', 'band']

type Reihe = 'liquiditaet' | 'vermoegen'

type TipEintrag = { name: string; value: number | [number, number]; color?: string; dataKey: string; payload: ChartPunkt }

function Tip({ active, payload, fmt, tag, farbe }: {
  active?: boolean
  payload?: TipEintrag[]
  fmt: (n: number) => string
  tag: (t: number) => string
  farbe: string
}) {
  if (!active || !payload?.length) return null
  const punkt = payload[0].payload
  const istHeute = punkt.ist !== undefined && punkt.szenario !== undefined
  const zeilen: { schluessel: string; name: string; farbe: string; text: string }[] = []
  for (const p of payload) {
    if (p.value === undefined || p.value === null) continue
    if (p.dataKey === 'band') {
      const [u, o] = p.value as [number, number]
      if (o - u > 1) zeilen.push({ schluessel: 'band', name: '80-%-Bereich', farbe, text: `${fmt(u)} bis ${fmt(o)}` })
      continue
    }
    // Am Punkt „heute“ tragen Verlauf und Prognose denselben Wert — nur einmal zeigen.
    if ((p.dataKey === 'szenario' || p.dataKey === 'basis') && istHeute) continue
    zeilen.push({ schluessel: p.dataKey, name: p.name, farbe: p.color ?? farbe, text: fmt(p.value as number) })
  }
  return (
    <div className="max-w-[16rem] rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-popover-foreground">{tag(punkt.t)}</p>
      {zeilen.map(z => (
        <div key={z.schluessel} className="mt-1 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: z.farbe }} />
            <span className="truncate">{z.name}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums text-popover-foreground">{z.text}</span>
        </div>
      ))}
    </div>
  )
}

function Legende({ mitAnnahmen, farbe }: { mitAnnahmen: boolean; farbe: string }) {
  const eintraege: { key: string; text: string; stil: React.CSSProperties }[] = [
    { key: 'ist', text: 'Bisher', stil: { borderTop: `2.5px solid ${farbe}` } },
    { key: 'szenario', text: mitAnnahmen ? 'Prognose mit Annahmen' : 'Prognose', stil: { borderTop: `2.5px dashed ${farbe}` } },
    ...(mitAnnahmen ? [{ key: 'basis', text: 'ohne Annahmen', stil: { borderTop: '2px dotted var(--muted-foreground)' } }] : []),
    { key: 'band', text: '80-%-Bereich', stil: { height: 8, background: farbe, opacity: 0.2, borderRadius: 2 } },
  ]
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legende">
      {REIHENFOLGE.map(k => eintraege.find(e => e.key === k)).filter((e): e is NonNullable<typeof e> => !!e).map(e => (
        <li key={e.key} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 shrink-0" style={e.stil} />
          {e.text}
        </li>
      ))}
    </ul>
  )
}

export function PrognoseChartImpl({ daten, mitAnnahmen }: { daten: ChartDaten; mitAnnahmen: boolean }) {
  const { locale } = useSettings()
  const [reihe, setReihe] = useState<Reihe>('liquiditaet')
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const kompakt = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  // t liegt auf Mittag UTC; die Formatierung in UTC verhindert, dass eine Zeitzone den Tag verschiebt.
  const monat = (t: number) => new Date(t).toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })
  const tag = (t: number) => new Date(t).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

  const istLiq = reihe === 'liquiditaet'
  const farbe = istLiq ? 'var(--chart-accent)' : 'var(--chart-income)'
  const punkte = istLiq ? daten.liquiditaet : daten.vermoegen
  // Höchstens ~6 Monatsmarken, sonst überlappen sie am Handy.
  const schritt = Math.max(1, Math.ceil(daten.monatsanfaenge.length / 6))
  const ticks = daten.monatsanfaenge.filter((_, i) => i % schritt === 0)

  return (
    <section aria-label="Verlauf und Prognose" className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Kurve wählen" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {([['liquiditaet', 'Liquidität'], ['vermoegen', 'Nettovermögen']] as const).map(([key, label]) => (
            <button
              key={key} type="button" aria-pressed={reihe === key} onClick={() => setReihe(key)}
              className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-8 sm:text-xs ${
                reihe === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Legende mitAnnahmen={mitAnnahmen} farbe={farbe} />
      </div>

      <div className="h-[220px] w-full min-w-0 sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={punkte} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
              ticks={ticks} tickFormatter={monat}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false}
            />
            <YAxis
              width={44} tickFormatter={(n: number) => kompakt.format(n)}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']}
            />
            <Tooltip content={<Tip fmt={fmt} tag={tag} farbe={farbe} />} itemSorter={tooltipSortierer(REIHENFOLGE)} />
            {istLiq && <ReferenceLine y={0} stroke="var(--chart-expense)" strokeDasharray="4 4" />}
            <ReferenceLine
              x={daten.heute} stroke="var(--muted-foreground)" strokeOpacity={0.5}
              label={{ value: 'Heute', position: 'insideTopLeft', fontSize: 11, fill: 'var(--muted-foreground)' }}
            />
            <Area dataKey="band" name="80-%-Bereich" stroke="none" fill={farbe} fillOpacity={0.14}
              connectNulls isAnimationActive={false} activeDot={false} />
            {mitAnnahmen && (
              <Line dataKey="basis" name="Prognose ohne Annahmen" stroke="var(--muted-foreground)" strokeWidth={1.5}
                strokeDasharray="3 4" dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
            )}
            <Line dataKey="szenario" name={mitAnnahmen ? 'Prognose mit Annahmen' : 'Prognose'} stroke={farbe} strokeWidth={2}
              strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            <Line dataKey="ist" name="Bisheriger Verlauf" stroke={farbe} strokeWidth={2.25}
              dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            {istLiq && daten.tiefpunkt && (
              <ReferenceDot x={daten.tiefpunkt.t} y={daten.tiefpunkt.wert} r={4} fill="var(--background)" stroke={farbe} strokeWidth={2}
                label={{ value: fmt(daten.tiefpunkt.wert), position: 'bottom', fontSize: 11, fill: 'var(--muted-foreground)' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {istLiq
          ? 'Punkt = tiefster erwarteter Stand. Das Band zeigt, wo die Kurve in 8 von 10 möglichen Verläufen liegt.'
          : 'Anlagen sind ein Tausch und ändern das Vermögen nicht; Kursgewinne sind nicht eingerechnet (0 %).'}
      </p>
    </section>
  )
}
