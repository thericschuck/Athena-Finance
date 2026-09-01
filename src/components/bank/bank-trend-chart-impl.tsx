'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { BankTransaction } from '@/types/bank'

// Theme-Variablen statt fester Hex-Werte — dieselben --chart-income/-expense
// wie überall sonst, wo Geld gecharted wird (Analyse, Dashboard, Crypto), aber
// pro Theme-Preset (siehe globals.css) unterschiedlich eingefärbt.
const INCOME  = 'var(--chart-income)'
const EXPENSE = 'var(--chart-expense)'
// Netto ist weder Einnahme noch Ausgabe — mit einer der beiden Farben würde die Linie
// je nach Vorzeichen mal richtig, mal irreführend eingefärbt aussehen. Der neutrale
// Vordergrundton hält sie klar als eigene Größe erkennbar.
const NET = 'var(--foreground)'

interface MonthDatum { month: string; income: number; expense: number; net: number }

function buildData(transactions: BankTransaction[]): MonthDatum[] {
  const byMonth = new Map<string, { income: number; expense: number }>()
  for (const tx of transactions) {
    const key = tx.value_date.slice(0, 7) // YYYY-MM
    const entry = byMonth.get(key) ?? { income: 0, expense: 0 }
    if (tx.amount >= 0) entry.income += tx.amount
    else entry.expense += tx.amount // stays negative — plotted below the baseline
    byMonth.set(key, entry)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    // expense ist bereits negativ, deshalb Addition statt Subtraktion.
    .map(([month, v]) => ({ month, ...v, net: v.income + v.expense }))
}

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

interface Props {
  transactions: BankTransaction[]
  /** `YYYY-MM` des ausgewaehlten Monats, oder null. */
  selectedMonth?: string | null
  /** Klick auf eine Saeule. Derselbe Monat nochmal hebt die Auswahl auf. */
  onSelectMonth?: (month: string | null) => void
}

export function BankTrendChart({ transactions, selectedMonth, onSelectMonth }: Props) {
  const { locale } = useSettings()
  const selectable = typeof onSelectMonth === 'function'

  const data = useMemo(() => buildData(transactions), [transactions])
  const totalIncome  = useMemo(() => data.reduce((s, d) => s + d.income,  0), [data])
  const totalExpense = useMemo(() => data.reduce((s, d) => s + d.expense, 0), [data])
  const totalNet     = totalIncome + totalExpense

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Einnahmen &amp; Ausgaben pro Monat
        </p>
        <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten im aktuellen Filter.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Header carries both the legend and the period's totals — folds what used to be a
          separate "Summary strip" of two full-width boxes into this one line. */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Einnahmen &amp; Ausgaben pro Monat
          </p>
          {selectable && !selectedMonth && data.length > 1 && (
            <span className="text-[11px] text-muted-foreground/70">
              Monat anklicken zum Eingrenzen
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 font-semibold tabular-nums" style={{ color: INCOME }}>
            <span className="inline-block size-2 rounded-full" style={{ background: INCOME }} />
            +{fmtCurrency(totalIncome, 'EUR', locale, { fractionDigits: 0 })}
          </span>
          <span className="flex items-center gap-1.5 font-semibold tabular-nums" style={{ color: EXPENSE }}>
            <span className="inline-block size-2 rounded-full" style={{ background: EXPENSE }} />
            {fmtCurrency(totalExpense, 'EUR', locale, { fractionDigits: 0 })}
          </span>
          <span
            className="flex items-center gap-1.5 font-semibold tabular-nums border-l border-border pl-4"
            title="Netto über den gewählten Zeitraum"
          >
            <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: NET }} />
            <span className={totalNet >= 0 ? 'text-success' : 'text-danger'}>
              {totalNet >= 0 ? '+' : ''}{fmtCurrency(totalNet, 'EUR', locale, { fractionDigits: 0 })}
            </span>
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          // Auf dem Chart statt auf den Balken: so trifft man die ganze Spalte, auch die
          // Luecke zwischen Einnahme- und Ausgabebalken und den Bereich ueber kurzen Saeulen.
          onClick={selectable
            ? (state: { activeLabel?: string | number; activeTooltipIndex?: number | string | null }) => {
                // `activeLabel` kommt bei recharts 3 aus dem Tooltip-Zustand (siehe
                // state/externalEventsMiddleware.js) und ist leer, wenn beim Klick noch
                // kein Tooltip aktiv war — auf Touch-Geraeten der Normalfall, weil dort
                // kein mousemove vorausgeht. Dann ueber den Index nachschlagen.
                const raw = state?.activeLabel
                const idx = state?.activeTooltipIndex
                const m = typeof raw === 'string'
                  ? raw
                  : typeof idx === 'number' ? data[idx]?.month : undefined
                if (!m) return
                onSelectMonth!(m === selectedMonth ? null : m)
              }
            : undefined}
          style={selectable ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={v => monthLabel(v as string, locale)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={v => fmtCurrency(Math.abs(v as number), 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} width={56}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as MonthDatum
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs min-w-[140px]">
                  <p className="text-foreground font-medium mb-1">{monthLabel(label as string, locale)}</p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Einnahmen</span>
                    <span className="font-semibold tabular-nums" style={{ color: INCOME }}>
                      +{fmtCurrency(d.income, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Ausgaben</span>
                    <span className="font-semibold tabular-nums" style={{ color: EXPENSE }}>
                      {fmtCurrency(d.expense, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-border">
                    <span className="text-muted-foreground">Netto</span>
                    <span className={`font-semibold tabular-nums ${d.net >= 0 ? 'text-success' : 'text-danger'}`}>
                      {d.net >= 0 ? '+' : ''}{fmtCurrency(d.net, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              )
            }}
          />
          {/* isAnimationActive={false}: bei jedem Zeitraumwechsel wird der komplette
              Datensatz ersetzt, und recharts animiert dann sämtliche Balken neu. */}
          {/* Cells statt einer festen fill-Farbe: nur so laesst sich der gewaehlte Monat
              hervorheben. Nicht gewaehlte werden zurueckgenommen statt eingegraut — sie
              bleiben lesbar und der Vergleich funktioniert weiter. */}
          <Bar dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map(d => (
              <Cell key={d.month} fillOpacity={!selectedMonth || d.month === selectedMonth ? 1 : 0.28} />
            ))}
          </Bar>
          {/* radius auch hier [4, 4, 0, 0] und nicht [0, 0, 4, 4]: recharts zaehlt die Ecken ab
              dem Rechteck-Ursprung, und der liegt bei negativer Hoehe am UNTEREN Balkenende
              (y = Wert unterhalb der Nulllinie, height = negativ). Index 0/1 sind bei einem
              Ausgabebalken also unten, 2/3 an der Nulllinie — [0, 0, 4, 4] rundete die Saeule
              deshalb oben ab statt unten. */}
          <Bar dataKey="expense" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map(d => (
              <Cell key={d.month} fillOpacity={!selectedMonth || d.month === selectedMonth ? 1 : 0.28} />
            ))}
          </Bar>
          {/* Netto zuletzt, damit die Linie über den Balken liegt. Gestrichelt, weil sie
              eine abgeleitete Größe zeigt und keine dritte Messreihe. */}
          <Line
            type="monotone"
            dataKey="net"
            stroke={NET}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2.5, fill: NET, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
