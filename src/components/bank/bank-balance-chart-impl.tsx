'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { BankTransaction } from '@/types/bank'

// Same theme accent used for the Depot chart's "Wert" tab (depot-chart.tsx) — a balance is a
// value series like that, not an income/expense signal, so it gets the accent color, not the
// income/expense pair used elsewhere on this page.
const BALANCE_COLOR = 'var(--chart-accent)'

interface BalancePoint {
  /** Epoch-Millisekunden — die X-Achse ist eine echte Zeitachse, siehe unten. */
  ts: number
  date: string
  balance: number
}

const DAY_MS = 86_400_000

function isoToTs(iso: string): number {
  // Mittag UTC statt Mitternacht: so kippt der Wert nicht durch Zeitzonen- oder
  // Sommerzeit-Verschiebungen auf den Vor- oder Folgetag.
  return Date.parse(`${iso}T12:00:00Z`)
}

function tsToIso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Rekonstruiert den Kontostandsverlauf.
 *
 * Es gibt keine gespeicherte Saldenhistorie — `bank_balance` hält pro Konto nur den
 * aktuellen Stand (Upsert auf account_iban). Die Reihe entsteht, indem vom heutigen
 * Kontostand rückwärts durch die Buchungen gerechnet wird. Sie ist damit nur so
 * vollständig wie das geladene Buchungsjournal: fehlen ältere Umsätze, ist der früheste
 * Punkt nicht der echte Eröffnungsstand.
 *
 * WICHTIG — ein Punkt pro Buchungstag, nicht pro Kalendertag. Früher wurde jeder Tag
 * zwischen der ersten Buchung und heute aufgefüllt, damit recharts keine Diagonale über
 * buchungsfreie Zeiträume zieht. Das ist seit der Umstellung auf `type="stepAfter"`
 * unnötig (die Stufe hält den Wert von selbst), war aber der teuerste Teil der Seite:
 * die Geschäftsanteile haben vier Buchungen seit 2018 und erzeugten daraus rund 3.000
 * Datenpunkte, die recharts bei jedem Rendern durchlief.
 *
 * Damit die Abstände trotzdem zeitproportional bleiben, ist die X-Achse eine numerische
 * Zeitachse (`type="number"`, `scale="time"`) statt der voreingestellten Kategorieachse —
 * die hätte die verbliebenen Punkte gleichmäßig verteilt und Jahre wie Tage aussehen lassen.
 */
function buildData(transactions: BankTransaction[], currentBalance: number): BalancePoint[] {
  if (transactions.length === 0) return []

  // Vorausbuchungen ausschliessen. Die Bank liefert Buchungen mit einem Buchungstag in der
  // Zukunft bereits mit (beobachtet: eine Gutschrift mit entry_date 31.08. kam am 29.08.),
  // sie stecken aber noch NICHT im gemeldeten booked_balance. Da die Reihe von diesem Saldo
  // rueckwaerts rechnet, verschiebt jede solche Buchung die komplette Kurve — konkret lag
  // der Verlauf dadurch durchgehend 492,50 EUR zu tief und widersprach der Kontodetailseite
  // unter Finance, die dieselbe Kurve aus account_balances nimmt.
  const today = todayIso()
  const booked = transactions.filter(t => (t.entry_date ?? t.value_date) <= today)
  if (booked.length === 0) return []

  const sorted = [...booked].sort((a, b) => a.value_date.localeCompare(b.value_date))
  const totalDelta = sorted.reduce((s, t) => s + t.amount, 0)

  const points: BalancePoint[] = []
  let running = currentBalance - totalDelta

  // Eröffnungsstand als eigener Punkt, einen Tag vor der ersten Buchung: sonst startet die
  // Kurve schon auf dem Stand NACH der ersten Buchung und deren Sprung fehlt.
  const openingTs = isoToTs(sorted[0].value_date) - DAY_MS
  points.push({ ts: openingTs, date: tsToIso(openingTs), balance: running })

  for (let i = 0; i < sorted.length; i++) {
    running += sorted[i].amount
    // Nur den letzten Stand je Tag behalten — das ist der Tagesendsaldo.
    const isLastOfDay = i === sorted.length - 1 || sorted[i + 1].value_date !== sorted[i].value_date
    if (isLastOfDay) {
      const date = sorted[i].value_date
      points.push({ ts: isoToTs(date), date, balance: running })
    }
  }

  // Bis heute verlängern, damit die Linie am aktuellen Stand endet und nicht bei der
  // letzten Buchung aufhört.
  const last = points[points.length - 1]
  if (last.date < today) {
    points.push({ ts: isoToTs(today), date: today, balance: last.balance })
  }

  return points
}

/**
 * Schneidet die Reihe auf den gewählten Zeitraum zu.
 *
 * Bewusst *nach* der Rekonstruktion und nicht davor: `buildData` rechnet vom heutigen
 * Kontostand rückwärts durch alle Buchungen. Würde man vorher filtern, bliebe der
 * Startwert zwar rechnerisch richtig, aber Konten ohne Bewegung im Fenster (Bausparer,
 * Genossenschaftsanteile) hätten gar keinen Datenpunkt mehr und fielen auf "noch nicht
 * genug Daten" zurück. So bleibt der letzte bekannte Stand als flache Linie stehen.
 */
function sliceFrom(points: BalancePoint[], from?: string): BalancePoint[] {
  if (!from || points.length === 0) return points
  const fromTs = isoToTs(from)
  const startIndex = points.findIndex(p => p.ts >= fromTs)

  // Alles liegt vor dem Fenster: den letzten bekannten Stand auf beiden Rändern zeigen,
  // damit eine flache Linie entsteht statt "nicht genug Daten".
  if (startIndex === -1) {
    const last = points[points.length - 1]
    const today = todayIso()
    return [
      { ts: fromTs, date: from, balance: last.balance },
      { ts: isoToTs(today), date: today, balance: last.balance },
    ]
  }
  if (startIndex === 0) return points

  // Faellt der Zeitraumbeginn genau auf einen Buchungstag, traegt points[startIndex] bereits
  // den Tagesendsaldo fuer `from` — ein zusaetzlicher Randpunkt haette dasselbe `ts` und waere
  // ein Duplikat. Die X-Achse ist eine numerische Zeitachse, recharts baut die Tick-Keys aus
  // dem Wert und der Pixelkoordinate: zwei Punkte auf demselben ts erzeugten "two children
  // with the same key" und liessen die Achse durcheinandergeraten. Sichtbar wurde das beim
  // 6M-Filter, dessen Cutoff zufaellig auf einen Buchungstag fiel.
  if (points[startIndex].ts === fromTs) return points.slice(startIndex)

  // Der Punkt direkt vor dem Fenster trägt den Eröffnungsstand — auf `from` datiert,
  // damit die X-Achse exakt am Zeitraumbeginn anfängt.
  return [
    { ts: fromTs, date: from, balance: points[startIndex - 1].balance },
    ...points.slice(startIndex),
  ]
}

// Omitting the year reads fine for a chart confined to one calendar year, but this data can
// span many years (e.g. a Bausparvertrag/Genossenschaftsanteil-style account with only a
// handful of deposits since 2018) — without the year, "21. Juni" and "21. Juni" a decade apart
// are indistinguishable and the line looks like it's jumping randomly between months instead
// of steadily progressing across years. Only added when the data actually spans >1 year, so a
// normal single-year account chart stays as compact as before.
function dateLabel(ts: number, locale: string, includeYear: boolean): string {
  return new Date(ts).toLocaleDateString(
    locale,
    includeYear
      ? { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: '2-digit', month: 'short', timeZone: 'UTC' },
  )
}

interface Props {
  accountName:    string
  currentBalance: number
  transactions:   BankTransaction[]
  /** Startdatum (ISO, `YYYY-MM-DD`) des gewählten Zeitraums. Ohne Angabe: volle Historie. */
  from?:          string
}

export function BankBalanceChart({ accountName, currentBalance, transactions, from }: Props) {
  const { locale } = useSettings()
  const color = BALANCE_COLOR

  // Zwei getrennte Memos, nicht eines: die Rekonstruktion hängt NICHT am Zeitraum. Lagen
  // beide zusammen, rechnete jeder Klick auf 3M/6M/1J die komplette Historie neu durch —
  // mal drei Konten. Jetzt kostet ein Zeitraumwechsel nur noch das Zuschneiden.
  const series = useMemo(
    () => buildData(transactions, currentBalance),
    [transactions, currentBalance],
  )
  const data = useMemo(() => sliceFrom(series, from), [series, from])

  const spansMultipleYears = useMemo(() => {
    const years = new Set(data.map(d => d.date.slice(0, 4)))
    return years.size > 1
  }, [data])

  if (data.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4 truncate">
          Kontostand · {accountName}
        </p>
        <p className="text-sm text-muted-foreground py-8 text-center">Noch nicht genug Daten für einen Verlauf.</p>
      </div>
    )
  }

  const gradientId = `gradBalance-${accountName.replace(/\W/g, '')}`

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          Kontostand · {accountName}
        </p>
        <p className="text-sm font-semibold tabular-nums shrink-0" style={{ color }}>
          {fmtCurrency(data[data.length - 1].balance, 'EUR', locale, { fractionDigits: 2 })}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => dateLabel(v as number, locale, spansMultipleYears)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} minTickGap={32}
          />
          <YAxis
            tickFormatter={v => fmtCurrency(v as number, 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5, className: 'tabular-nums' }}
            axisLine={false} tickLine={false} width={56}
          />
          <Tooltip
            cursor={{ stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as BalancePoint
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs min-w-[140px]">
                  <p className="text-foreground font-medium mb-1">{dateLabel(d.ts, locale, spansMultipleYears)}</p>
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Kontostand</span>
                    <span className="font-semibold tabular-nums" style={{ color }}>
                      {fmtCurrency(d.balance, 'EUR', locale, { fractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              )
            }}
          />
          {/* stepAfter, not monotone — the data is a genuine step function (flat between
              transaction days, then a jump), and a spline would visually smooth that jump
              into a fake gradual ramp. */}
          <Area
            type="stepAfter"
            dataKey="balance"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            // Ohne das animiert recharts die gesamte Fläche bei JEDEM Zeitraumwechsel neu —
            // der sichtbarste Teil des Hängers beim Umschalten.
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
