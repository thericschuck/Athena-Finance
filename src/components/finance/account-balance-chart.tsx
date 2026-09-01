'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency as libFmtCurrency } from '@/lib/format'
import { periodDateFormat, type Period } from '@/lib/period'

export type AccountBalancePoint = {
  snapshot_date: string
  balance:       number
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(Math.round(n))
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string
}) {
  const { locale } = useSettings()

  if (!active || !payload?.length) return null
  const date = new Date(label ?? '').toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs min-w-[140px]">
      <p className="text-muted-foreground mb-1">{date}</p>
      <p className="text-sm font-bold tabular-nums text-foreground">{libFmtCurrency(payload[0].value, 'EUR', locale, { fractionDigits: 0 })}</p>
    </div>
  )
}

/**
 * Rein darstellend: `points` sind bereits auf den Zeitraum zugeschnitten, `period` dient
 * nur noch dem Achsenformat. Der Umschalter sass frueher hier drin und galt deshalb nur
 * fuer den Chart — waehrend Einnahmen/Ausgaben/Saldo daneben die volle Historie summierten.
 * Jetzt steuert ein Zeitraum im Seitenkopf die ganze Seite.
 */
export function AccountBalanceChart({
  points,
  period,
  currency = 'EUR',
  color,
}: {
  points:    AccountBalancePoint[]
  period:    Period
  currency?: string
  color?:    string | null
}) {
  const { locale } = useSettings()
  const data = points

  const xFormatter = (v: string): string =>
    new Date(v).toLocaleDateString(locale, periodDateFormat(period))

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Noch keine Verlaufsdaten — der tägliche Snapshot läuft um 23:59 Uhr.
        </p>
      </div>
    )
  }

  const isPositive = (data.at(-1)?.balance ?? 0) >= 0
  const lineColor = isPositive
    ? (color ?? 'var(--primary)')
    : 'var(--destructive)'

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-4 gap-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Kontostand Verlauf {currency !== 'EUR' ? `(${currency})` : ''}
        </p>
        {data.length > 0 && (
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {libFmtCurrency(data[data.length - 1].balance, currency, locale, { fractionDigits: 2 })}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={xFormatter}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} minTickGap={40}
          />
          <YAxis
            tickFormatter={v => fmtShort(v as number)}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false} tickLine={false} width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#balGrad)"
            dot={false}
            activeDot={{ r: 4, fill: lineColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
