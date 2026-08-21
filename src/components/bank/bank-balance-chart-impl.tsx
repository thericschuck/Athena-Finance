'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { BankTransaction } from '@/types/bank'

// Same gold used for the Depot chart's "Wert" tab (depot-chart.tsx) — a balance is a value
// series like that, not an income/expense signal, so it gets the value color, not the
// income/expense pair used elsewhere on this page.
const BALANCE_COLOR = '#CDA564'

interface BalancePoint { date: string; balance: number }

// Date.toISOString() converts to UTC first — between local midnight and 2am CEST that
// rolls back to the previous calendar day, which would misalign the fill loop below.
function toLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// There is no stored balance history — bank_balance only keeps the latest snapshot per
// account (upsert on account_iban). The series below is reconstructed by walking the
// account's transactions backwards from the current balance, so it's only as complete as
// the loaded transaction ledger: if older transactions were never synced, the earliest
// point on the chart is not the account's true opening balance.
function buildData(transactions: BankTransaction[], currentBalance: number): BalancePoint[] {
  const sorted = [...transactions].sort((a, b) => a.value_date.localeCompare(b.value_date))
  if (sorted.length === 0) return []

  const totalDelta = sorted.reduce((s, t) => s + t.amount, 0)

  let running = currentBalance - totalDelta
  const byDay = new Map<string, number>()
  for (const tx of sorted) {
    running += tx.amount
    byDay.set(tx.value_date, running) // last write per day → end-of-day balance
  }

  // Days with no transaction aren't "missing data" — the balance simply didn't change,
  // so they need an explicit point carrying the last known value forward. Without this,
  // recharts draws a straight line (or curve) directly between the two nearest real days,
  // which looks like a gradual ramp instead of the flat-then-jump the account actually did.
  // Filled through today so the line ends at the account's current, known balance.
  const filled: BalancePoint[] = []
  const cursor = new Date(`${sorted[0].value_date}T00:00:00`)
  const lastTxDate = sorted[sorted.length - 1].value_date
  const todayIso = toLocalIso(new Date())
  const end = new Date(`${lastTxDate > todayIso ? lastTxDate : todayIso}T00:00:00`)
  let lastKnown = currentBalance - totalDelta

  while (cursor <= end) {
    const iso = toLocalIso(cursor)
    const dayValue = byDay.get(iso)
    if (dayValue !== undefined) lastKnown = dayValue
    filled.push({ date: iso, balance: lastKnown })
    cursor.setDate(cursor.getDate() + 1)
  }
  return filled
}

// Omitting the year reads fine for a chart confined to one calendar year, but this data can
// span many years (e.g. a Bausparvertrag/Genossenschaftsanteil-style account with only a
// handful of deposits since 2018) — without the year, "21. Juni" and "21. Juni" a decade apart
// are indistinguishable and the line looks like it's jumping randomly between months instead
// of steadily progressing across years. Only added when the data actually spans >1 year, so a
// normal single-year account chart stays as compact as before.
function dateLabel(iso: string, locale: string, includeYear: boolean): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    locale,
    includeYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' },
  )
}

interface Props {
  accountName:    string
  currentBalance: number
  transactions:   BankTransaction[]
}

export function BankBalanceChart({ accountName, currentBalance, transactions }: Props) {
  const { locale } = useSettings()
  const color = BALANCE_COLOR

  const data = useMemo(() => buildData(transactions, currentBalance), [transactions, currentBalance])
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

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4 truncate">
        Kontostand · {accountName}
      </p>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradBalance-${accountName}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={v => dateLabel(v as string, locale, spansMultipleYears)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={v => fmtCurrency(v as number, 'EUR', locale, { fractionDigits: 0 })}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} width={56}
          />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as BalancePoint
              return (
                <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs min-w-[140px]">
                  <p className="text-foreground font-medium mb-1">{dateLabel(label as string, locale, spansMultipleYears)}</p>
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
          <Area type="stepAfter" dataKey="balance" stroke={color} fill={`url(#gradBalance-${accountName})`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
