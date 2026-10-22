'use client'

import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { loadValuations } from '@/app/(dashboard)/inventar/valuation-actions'
import { fmtCurrency } from '@/lib/format'
import type { Valuation } from '@/lib/valuables'

interface Props {
  valuableId: string
  kaufpreis: number | null
  gekauftAm: string | null
  locale: string
  /** Ändert sich, wenn eine Bewertung gespeichert wurde -> Verlauf neu laden. */
  refreshKey?: string
}

type Punkt = { t: number; wert: number; label: string }

const STALE_MONTHS = 12

const tag = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()

/** Ganze Monate zwischen einem Datum und heute. */
function monateSeit(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const n = new Date()
  let m = (n.getUTCFullYear() - d.getUTCFullYear()) * 12 + (n.getUTCMonth() - d.getUTCMonth())
  if (n.getUTCDate() < d.getUTCDate()) m -= 1
  return Math.max(0, m)
}

export function ValuableHistory({ valuableId, kaufpreis, gekauftAm, locale, refreshKey }: Props) {
  const [rows, setRows] = useState<Valuation[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    setFehler(null)
    loadValuations(valuableId)
      .then((res) => {
        if (!aktiv) return
        if ('error' in res) setFehler(res.error)
        else setRows(res.valuations)
      })
      .catch(() => aktiv && setFehler('Verlauf konnte nicht geladen werden'))
    return () => {
      aktiv = false
    }
  }, [valuableId, refreshKey])

  const datumFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }), [locale])

  const punkte = useMemo<Punkt[]>(() => {
    if (!rows) return []
    const liste: Punkt[] = rows.map((r) => ({ t: tag(r.bewertet_am), wert: r.wert, label: r.bewertet_am }))
    // Kaufpreis als Startpunkt, sofern Kaufdatum bekannt und nicht schon eine Bewertung am selben Tag
    if (kaufpreis !== null && gekauftAm && !liste.some((p) => p.t === tag(gekauftAm))) {
      liste.push({ t: tag(gekauftAm), wert: kaufpreis, label: gekauftAm })
    }
    return liste.sort((a, b) => a.t - b.t)
  }, [rows, kaufpreis, gekauftAm])

  if (fehler) return <p className="text-xs text-muted-foreground">{fehler}</p>

  if (rows === null) {
    return <div className="h-28 w-full animate-pulse rounded-md bg-muted/50" aria-busy="true" aria-label="Verlauf lädt" />
  }

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Noch keine Bewertung</p>
  }

  const letzte = rows[rows.length - 1]
  const monate = monateSeit(letzte.bewertet_am)
  const veraltet = monate > STALE_MONTHS
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale)

  return (
    <div className="space-y-1.5">
      {punkte.length < 2 ? (
        <p className="text-xs text-muted-foreground">
          Eine Bewertung: <span className="tabular-nums text-foreground">{euro(letzte.wert)}</span> ({datumFmt.format(tag(letzte.bewertet_am))})
        </p>
      ) : (
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={punkte} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => datumFmt.format(t)}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                width={52}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => euro(v)}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => datumFmt.format(Number(t))}
                formatter={(v) => [euro(Number(v)), 'Wert']}
              />
              <Line
                type="monotone"
                dataKey="wert"
                stroke="var(--chart-accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--card)', stroke: 'var(--chart-accent)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {veraltet && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Wert seit {monate} Monaten nicht aktualisiert</p>
      )}
    </div>
  )
}
