'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { letzteMonate, type BalkenPunkt } from '@/lib/verlauf/monate'

/**
 * Einnahmen gegen Ausgaben je Monat als gruppierte Balken. Beide Reihen sind die Summen, die
 * auch die Tabelle zeigt (inklusive Anlage und Forderungen), damit Chart und Tabelle nicht
 * auseinanderlaufen. Grün/Rot kommen aus den Theme-Tokens und ändern sich mit dem Theme.
 */

const ZEITRAEUME = [
  { key: '6m',  label: '6 Mon.',  monate: 6 },
  { key: '12m', label: '12 Mon.', monate: 12 },
  { key: 'max', label: 'Alles',   monate: null },
] as const

type Zeitraum = typeof ZEITRAEUME[number]['key']

export default function MonatsBalken({ punkte, locale }: { punkte: BalkenPunkt[]; locale: string }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>('12m')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const daten = useMemo(() => {
    const z = ZEITRAEUME.find(x => x.key === zeitraum)!
    return letzteMonate(punkte, z.monate)
  }, [punkte, zeitraum])

  // Monatskürzel ("Jan 26"); UTC, damit die Zeitzone den Monat nicht verschiebt.
  const monatFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    [locale],
  )
  const label = (m: string) => monatFmt.format(new Date(`${m}-01T00:00:00Z`))

  if (punkte.length < 2) return null

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Einnahmen und Ausgaben je Monat
        </p>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {ZEITRAEUME.map(z => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZeitraum(z.key)}
              aria-pressed={zeitraum === z.key}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                zeitraum === z.key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={label}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              width={56}
              tickFormatter={(v: number) => euro(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={m => label(String(m))}
              formatter={(v, name) => [euro(Number(v)), name === 'income' ? 'Einnahmen' : 'Ausgaben']}
            />
            <Bar dataKey="income" fill="var(--success)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="expense" fill="var(--danger)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-success" />Einnahmen</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-danger" />Ausgaben</li>
      </ul>
    </div>
  )
}
