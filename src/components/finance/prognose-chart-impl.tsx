'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

export type PrognosePunkt = {
  /** `YYYY-MM` */
  month: string
  /** Liquidität am Monatsende ohne / mit Annahmen. */
  basis: number
  szenario: number
  /** Tiefster Stand im Monat (mit Annahmen). */
  tiefpunkt: number
  /** Nettovermögen am Monatsende mit Annahmen. */
  vermoegen: number
  teilmonat: boolean
}

const abbr = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0))

function Tip({ active, payload, label, fmt }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-popover-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-popover-foreground">{fmt(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export function PrognoseChartImpl({ daten, mitAnnahmen }: { daten: PrognosePunkt[]; mitAnnahmen: boolean }) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const label = (m: string) =>
    new Date(m + '-01T12:00:00').toLocaleDateString(locale, { month: 'short', year: '2-digit' })
  const data = daten.map(d => ({ ...d, label: label(d.month) + (d.teilmonat ? '*' : '') }))

  const kopf = 'mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className={kopf}>Liquidität am Monatsende</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={abbr} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip fmt={fmt} />} />
            <ReferenceLine y={0} stroke="var(--chart-expense)" strokeDasharray="4 4" />
            <Area dataKey="tiefpunkt" name="Tiefster Stand im Monat" stroke="none" fill="var(--chart-accent)" fillOpacity={0.12} />
            {mitAnnahmen && (
              <Line dataKey="basis" name="Ohne Annahmen" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
            )}
            <Line dataKey="szenario" name={mitAnnahmen ? 'Mit Annahmen' : 'Prognose'} stroke="var(--chart-accent)" strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--chart-accent)', strokeWidth: 0 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-muted-foreground">* laufender Monat: nur die Resttage. Die Fläche zeigt den tiefsten Stand im Monat.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className={kopf}>Nettovermögen am Monatsende</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={abbr} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip content={<Tip fmt={fmt} />} />
            <Line dataKey="vermoegen" name="Nettovermögen" stroke="var(--chart-income)" strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--chart-income)', strokeWidth: 0 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Anlagen sind ein Tausch und ändern das Vermögen nicht; Kursgewinne sind nicht eingerechnet (0 %).
        </p>
      </div>
    </div>
  )
}
