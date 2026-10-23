'use client'

import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import {
  ComposedChart, Bar, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyComparison } from '@/lib/analyseData'
import { useOptionalUrlFilters } from '@/components/providers/url-filters'
import {
  balkenDeckkraft, mindestBreite, monatKlartext, naechsteMonatsauswahl,
} from '@/lib/analyse/vergleichsdaten'

interface Props { data: MonthlyComparison[] }

/** Monatszeile plus die beiden nur fürs Zeichnen gebrauchten Felder — siehe toRows. */
interface Row extends MonthlyComparison {
  /** Sparquote, in den Achsenbereich gekappt: der Wert, den die Linie zeichnet. */
  plot: number | null
  /** true, wenn dafür gekappt wurde. Der Tooltip nennt dann weiterhin den echten Wert. */
  clamped: boolean
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { payload?: Row }[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  // Alle Serien dieses Monats zeigen auf dieselbe Datenzeile — die lesen wir direkt,
  // statt die Werte über dataKey aus dem payload zu fischen. Nur so kommt auch die
  // ungekappte Sparquote in den Tooltip (payload trägt den gezeichneten Wert `plot`).
  const row = payload[0]?.payload
  if (!row) return null

  // Reihenfolge Einnahmen, Ausgaben, Sparquote — dieselbe wie Legende und Balken (links nach
  // rechts) im Kopf der Karte; beide Stellen ändern sich nur gemeinsam.
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-xl text-xs min-w-37">
      <p className="font-semibold text-popover-foreground mb-2">
        {/* Mit `key` der volle Monat samt Jahr: das Kurzlabel „Mär" ist über 24 Monate doppelt. */}
        {row.key ? monatKlartext(row.key) : label}
        {row.laufend && <span className="ml-1.5 font-normal text-muted-foreground">· läuft noch</span>}
      </p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Einnahmen</span>
          <span className="text-(--chart-income) font-medium tabular-nums">
            {row.einnahmen.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Ausgaben</span>
          <span className="text-(--chart-expense) font-medium tabular-nums">
            {row.ausgaben.toLocaleString('de-DE')} €
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-border">
          <span className="text-muted-foreground">Sparquote</span>
          <span className="text-(--chart-accent) font-semibold tabular-nums">
            {row.sparquote == null ? '—' : `${row.sparquote} %`}
          </span>
        </div>
        {row.sparquote == null && (
          <p className="text-[11px] text-muted-foreground pt-0.5">
            Keine Einnahmen in diesem Monat — Quote nicht definiert
          </p>
        )}
        {row.clamped && (
          <p className="text-[11px] text-muted-foreground pt-0.5">
            Liegt außerhalb der Achse — Punkt am Rand gekappt
          </p>
        )}
        {row.laufend && (
          <p className="text-[11px] text-muted-foreground pt-0.5">
            Monat noch nicht abgeschlossen — Werte ändern sich noch
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Achsenbereich der Sparquote: fest −100 % bis +100 %.
 *
 * Vorher mitwandernd (Untergrenze am kleinsten Monat, Obergrenze mindestens 60 %). Das nutzte
 * die Kartenhöhe besser aus, hatte aber zwei Nachteile: die Null lag bei jedem Datenstand
 * woanders, und ohne Blick auf die rechte Achse war nicht zu sehen, ob ein Punkt bei 30 oder
 * bei 70 % liegt. Symmetrisch ist die Achse selbsterklärend — obere Hälfte heißt „mehr als
 * die Hälfte der Einnahmen gespart", die Mittellinie ist die Null, untere Hälfte ist Minus.
 *
 * +100 % ist zugleich das mathematische Maximum (nur bei Ausgaben von 0 €), die Skala
 * verschenkt oben also nichts. Nach unten ist sie offen — −733 % gibt es real; solche Monate
 * kappt toRows auf −100 %, statt alle anderen zu einer flachen Linie zusammenzudrücken.
 */
const PCT_DOMAIN: [number, number] = [-100, 100]
const PCT_TICKS  = [-100, -50, 0, 50, 100]

/**
 * Kappt die Sparquote auf den Achsenbereich.
 *
 * Der Deckel oben in sparquoteDomain hat die ACHSE begrenzt, nicht die Werte — recharts
 * zeichnet eine Linie ohne `allowDataOverflow` aber ungeclippt weiter. Ein Monat wie der
 * November 2025 (−733 %) schoss damit unten aus der Karte heraus und lief über die Elemente
 * darunter: das war die Linie, die „verrückt spielt". Jetzt endet der Punkt am Achsenrand,
 * wird als Ring statt als Punkt gezeichnet und der Tooltip nennt den echten Wert.
 */
function toRows(data: MonthlyComparison[], [lo, hi]: [number, number]): Row[] {
  return data.map(d => {
    const plot = d.sparquote == null ? null : Math.min(hi, Math.max(lo, d.sparquote))
    return { ...d, plot, clamped: plot != null && plot !== d.sparquote }
  })
}

/**
 * Punkt auf der Sparquoten-Linie. Gekappte Monate bekommen einen Ring, damit man am Rand
 * unterscheiden kann „genau dieser Wert" von „mindestens so weit draußen". Der laufende Monat
 * bekommt denselben Ring, aber gestrichelt — er ist kein Extremwert, sondern schlicht noch
 * nicht fertig.
 */
function SparquoteDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Row }) {
  if (cx == null || cy == null || payload?.plot == null) return null
  if (payload.laufend) {
    return <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke="var(--chart-accent)" strokeWidth={2} strokeDasharray="2 2" />
  }
  return payload.clamped
    ? <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke="var(--chart-accent)" strokeWidth={2} />
    : <circle cx={cx} cy={cy} r={3} fill="var(--chart-accent)" />
}

export function MonatsVergleich({ data }: Props) {
  const rows = toRows(data, PCT_DOMAIN)
  // Optional: dasselbe Diagramm laeuft als Demo auf der Landingpage, ohne Provider — dort nicht anklickbar.
  const filters = useOptionalUrlFilters()
  const gewaehlt = filters?.get('monat') ?? null
  const waehlbar = rows.some(r => r.key)

  // Auf schmalen Bildschirmen scrollt der Chart waagerecht (Mindestbreite je Monat); der
  // Start liegt rechts, weil dort die neuesten Monate stehen.
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])
  // Der laufende Monat haengt separat dran (siehe withLaufendemMonat in AnalysePage) — die
  // Unterschrift zaehlt nur die wirklich abgeschlossenen Monate, der laufende wird im Chart
  // selbst (abgeschwaechte Balken, "läuft noch" im Tooltip) als unvollstaendig markiert.
  const abgeschlossen = data.filter(d => !d.laufend).length
  const hatLaufenden = data.some(d => d.laufend)

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-x-3 gap-y-2 flex-wrap mb-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Monatlicher Vergleich</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {abgeschlossen === 1 ? 'Letzter abgeschlossener Monat' : `Letzte ${abgeschlossen} abgeschlossene Monate`}
            {hatLaufenden && ' + laufender Monat'}
          </p>
          {waehlbar && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {gewaehlt
                ? <>Nur {monatKlartext(gewaehlt)} in der Buchungsliste · Balken nochmal antippen hebt auf</>
                : <>Monat antippen, um seine Buchungen unten zu sehen</>}
              <span className="sm:hidden"> · seitlich wischen für ältere Monate</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-income) opacity-80" />
            Einnahmen
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-(--chart-expense) opacity-80" />
            Ausgaben
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5 bg-(--chart-accent)" />
            Sparquote
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
      <div className="min-w-(--mw) sm:min-w-0" style={{ '--mw': `${mindestBreite(rows.length)}px` } as CSSProperties}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={rows}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          // Auf dem Chart statt auf den Balken: trifft die ganze Spalte, auch die Lücke
          // zwischen den Balken. Auf Touch fehlt beim Tippen oft der Tooltip-Zustand
          // (activeLabel leer) — dann über den Index nachschlagen, wie in BankTrendChart.
          onClick={waehlbar
            ? (state: { activeTooltipIndex?: number | string | null }) => {
                const idx = state?.activeTooltipIndex
                const key = typeof idx === 'number' ? rows[idx]?.key : typeof idx === 'string' ? rows[Number(idx)]?.key : undefined
                const naechste = naechsteMonatsauswahl(key, gewaehlt)
                if (naechste !== undefined) filters?.set('monat', naechste)
              }
            : undefined}
          style={waehlbar ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            // Überlappende Beschriftungen auslassen statt zu stapeln; die Monate stehen
            // vollständig im Tooltip.
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis
            yAxisId="eur"
            tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)', className: 'tabular-nums' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={v => `${v} %`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={PCT_DOMAIN}
            // Feste Marken statt recharts-Automatik: −100/−50/0/50/100 machen die Halbierung
            // der Karte an der Null sichtbar, die Automatik käme auf 25er-Schritte.
            ticks={PCT_TICKS}
            // Zusammen mit toRows die Garantie, dass nichts aus der Karte läuft: die Werte
            // sind gekappt, und falls doch etwas durchrutscht, clippt recharts es weg.
            allowDataOverflow
            width={44}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
          />
          {/* Pro Monat eine Cell statt einer festen fillOpacity: nur so kann der laufende
              Monat (unvollstaendig, siehe withLaufendemMonat) blasser gezeichnet werden als
              die abgeschlossenen — ohne eine zweite <Bar> für einen einzigen Balken zu brauchen. */}
          <Bar
            yAxisId="eur"
            dataKey="einnahmen"
            fill="var(--chart-income)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          >
            {rows.map((r, i) => (
              <Cell key={i} fillOpacity={balkenDeckkraft(!!r.laufend, r.key, gewaehlt)} />
            ))}
          </Bar>
          <Bar
            yAxisId="eur"
            dataKey="ausgaben"
            fill="var(--chart-expense)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          >
            {rows.map((r, i) => (
              <Cell key={i} fillOpacity={balkenDeckkraft(!!r.laufend, r.key, gewaehlt)} />
            ))}
          </Bar>
          {/* Nulllinie der Sparquote, jetzt fest auf halber Kartenhöhe: darunter ist mehr
              rausgegangen als reinkam. Ohne sie liest man die rechte Achse falsch, weil die
              Balken auf der EUR-Null unten stehen. Nicht mehr an Minusmonate gebunden — bei
              symmetrischer Achse ist sie die Mittellinie, die die Karte halbiert. */}
          <ReferenceLine
            yAxisId="pct"
            y={0}
            stroke="var(--chart-accent)"
            strokeOpacity={0.45}
            strokeDasharray="4 4"
            // Bewusst INNEN: `position: 'right'` legt die Schrift auf die Ticks der
            // rechten Achse.
            label={{
              value: '0 % Sparquote',
              position: 'insideTopRight',
              fontSize: 11,
              fill: 'var(--muted-foreground)',
            }}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="plot"
            stroke="var(--chart-accent)"
            strokeWidth={2}
            // Monate ohne Einnahmen haben keine Quote — Lücke statt Sprung auf 0.
            connectNulls={false}
            dot={<SparquoteDot />}
            activeDot={{ r: 5, fill: 'var(--chart-accent)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      </div>
    </div>
  )
}
