'use client'

import {
  ComposedChart, Bar, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyComparison } from '@/lib/analyseData'

interface Props { data: MonthlyComparison[] }

/** Monatszeile plus die beiden nur fürs Zeichnen gebrauchten Felder — siehe toRows. */
interface Row extends MonthlyComparison {
  /** Sparquote, in den Achsenbereich gekappt: der Wert, den die Linie zeichnet. */
  plot: number | null
  /** true, wenn dafür gekappt wurde. Der Tooltip nennt dann weiterhin den echten Wert. */
  clamped: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // Alle Serien dieses Monats zeigen auf dieselbe Datenzeile — die lesen wir direkt,
  // statt die Werte über dataKey aus dem payload zu fischen. Nur so kommt auch die
  // ungekappte Sparquote in den Tooltip (payload trägt den gezeichneten Wert `plot`).
  const row = payload[0]?.payload as Row | undefined
  if (!row) return null

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-xl text-xs min-w-37">
      <p className="font-semibold text-popover-foreground mb-2">{label}</p>
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
          <p className="text-[10px] text-muted-foreground pt-0.5">
            Keine Einnahmen in diesem Monat — Quote nicht definiert
          </p>
        )}
        {row.clamped && (
          <p className="text-[10px] text-muted-foreground pt-0.5">
            Liegt außerhalb der Achse — Punkt am Rand gekappt
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Achsenbereich der Sparquote.
 *
 * Vorher fest [0, 60]: alles darunter (ein Monat mit mehr Ausgaben als Einnahmen) und alles
 * darüber (ein Monat mit einer großen Einmalzahlung) lief außerhalb des Bildes und die Linie
 * verschwand am Rand. Untergrenze bei −100 % gedeckelt, weil ein einzelner Ausreißer wie
 * −339 % sonst alle übrigen Monate zu einer flachen Linie zusammendrückt — der Tooltip nennt
 * den echten Wert weiterhin.
 */
function sparquoteDomain(data: MonthlyComparison[]): [number, number] {
  const werte = data.map(d => d.sparquote).filter((v): v is number => v != null)
  if (werte.length === 0) return [0, 60]
  const min = Math.max(-100, Math.min(0, ...werte))
  const max = Math.max(60, ...werte)
  // Auf 20er-Schritte runden, damit die Ticks glatte Zahlen zeigen.
  return [Math.floor(min / 20) * 20, Math.ceil(max / 20) * 20]
}

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
 * unterscheiden kann „genau dieser Wert" von „mindestens so weit draußen".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SparquoteDot({ cx, cy, payload }: any) {
  if (cx == null || cy == null || payload?.plot == null) return null
  return payload.clamped
    ? <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke="var(--chart-accent)" strokeWidth={2} />
    : <circle cx={cx} cy={cy} r={3} fill="var(--chart-accent)" />
}

export function MonatsVergleich({ data }: Props) {
  const pctDomain = sparquoteDomain(data)
  const rows      = toRows(data, pctDomain)

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Monatlicher Vergleich</h2>
          {/* Explizit „abgeschlossen": der laufende Monat ist bewusst nicht dabei (siehe
              buildMonthlyComparison), sonst hinge die Sparquote am Monatsanfang an zwei
              Buchungen. */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.length === 1 ? 'Letzter abgeschlossener Monat' : `Letzte ${data.length} abgeschlossene Monate`}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
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

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="eur"
            tickFormatter={v => `${((v as number) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={pctDomain}
            // Zusammen mit toRows die Garantie, dass nichts aus der Karte läuft: die Werte
            // sind gekappt, und falls doch etwas durchrutscht, clippt recharts es weg.
            allowDataOverflow
            width={44}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
          />
          <Bar
            yAxisId="eur"
            dataKey="einnahmen"
            fill="var(--chart-income)"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            yAxisId="eur"
            dataKey="ausgaben"
            fill="var(--chart-expense)"
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          {/* Nulllinie der Sparquote — nur wenn es überhaupt Minusmonate gibt: darunter ist
              mehr rausgegangen als reinkam. Ohne sie liest man die rechte Achse falsch,
              weil die Balken auf der EUR-Null unten stehen. */}
          {pctDomain[0] < 0 && (
            <ReferenceLine
              yAxisId="pct"
              y={0}
              stroke="var(--chart-accent)"
              strokeOpacity={0.45}
              strokeDasharray="4 4"
              // Bewusst INNEN: `position: 'right'` legt die Schrift auf die Ticks der
              // rechten Achse, die je nach Wertebereich selbst keine 0 zeigt.
              label={{
                value: '0 % Sparquote',
                position: 'insideTopRight',
                fontSize: 9,
                fill: 'var(--muted-foreground)',
              }}
            />
          )}
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
  )
}
