'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '@/lib/format'
import { anzeigeReihenfolge } from '@/lib/chart-reihenfolge'
import type { VerlaufKennzahlen, VerlaufTag } from '@/lib/bank/verlauf'

/** Was der Server berechnet und an den (lazy geladenen) Chart reicht. */
export interface VerlaufDaten {
  /** Von unten nach oben gestapelt; gleiche Reihenfolge wie `VerlaufTag.werte`. */
  schichten: { name: string }[]
  punkte: VerlaufTag[]
  kennzahlen: VerlaufKennzahlen
  titel: string
  locale: string
}

// Themefarben --chart-cat-1..6; bei mehr als sechs Konten wiederholen sie sich.
const farbe = (i: number) => `var(--chart-cat-${(i % 6) + 1})`
const tagMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`)

interface Zeile {
  t: number
  datum: string
  summe: number
  [schicht: string]: number | string
}

export default function BankGesamtverlaufChart({ verlauf }: { verlauf: VerlaufDaten }) {
  const { schichten, punkte, kennzahlen, titel, locale } = verlauf
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const euroGenau = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })
  const mehrereJahre = punkte[0].datum.slice(0, 4) !== punkte[punkte.length - 1].datum.slice(0, 4)

  const datumFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, mehrereJahre
      ? { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }
      : { day: '2-digit', month: 'short', timeZone: 'UTC' }),
    [locale, mehrereJahre],
  )
  const datumLang = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [locale],
  )

  // Schichten unter den Schluesseln s0..sN (Kontonamen/IBANs taugen nicht als dataKey).
  const daten = useMemo<Zeile[]>(
    () => punkte.map(p => {
      const zeile: Zeile = { t: tagMs(p.datum), datum: p.datum, summe: p.summe }
      p.werte.forEach((w, i) => { zeile[`s${i}`] = w })
      return zeile
    }),
    [punkte],
  )

  // Legende und Tooltip in derselben Reihenfolge wie das Bild: oben zuerst (chart-reihenfolge.ts).
  const reihenfolge = useMemo(() => anzeigeReihenfolge(schichten.map((_, i) => i)), [schichten])
  const hatMinus = kennzahlen.tageImMinus > 0
  const mehrere = schichten.length > 1

  const kopf: { label: string; wert: string; warn?: boolean }[] = [
    { label: 'Tiefststand', wert: `${euro(kennzahlen.tief.wert)} · ${datumLang.format(tagMs(kennzahlen.tief.datum))}`, warn: kennzahlen.tief.wert < 0 },
    { label: 'Höchststand', wert: `${euro(kennzahlen.hoch.wert)} · ${datumLang.format(tagMs(kennzahlen.hoch.datum))}` },
  ]
  if (hatMinus) {
    kopf.push({ label: 'Tage im Minus', wert: `${kennzahlen.tageImMinus}`, warn: true })
  }

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</p>
          <p className={`mt-0.5 text-xl font-semibold tabular-nums tracking-tight ${kennzahlen.aktuell < 0 ? 'text-danger' : ''}`}>
            {euroGenau(kennzahlen.aktuell)}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {kopf.map(k => (
            <div key={k.label}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</dt>
              <dd className={`tabular-nums font-medium ${k.warn ? 'text-danger' : ''}`}>{k.wert}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daten} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
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
              minTickGap={40}
            />
            <YAxis
              width={60}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => euro(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            {hatMinus && <ReferenceLine y={0} stroke="var(--danger)" strokeOpacity={0.5} strokeDasharray="4 3" />}
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const z = payload[0].payload as Zeile
                return (
                  <div className="min-w-[170px] rounded-lg border border-border bg-popover p-2.5 text-xs shadow-md">
                    <p className="mb-1 font-medium text-foreground">{datumLang.format(z.t)}</p>
                    {reihenfolge.map(i => (
                      <p key={i} className="flex items-center justify-between gap-4">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 shrink-0 rounded-sm" style={{ background: farbe(i) }} />
                          <span className="truncate">{schichten[i].name}</span>
                        </span>
                        <span className="tabular-nums">{euroGenau(Number(z[`s${i}`]))}</span>
                      </p>
                    ))}
                    {mehrere && (
                      <p className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1 font-semibold">
                        <span>Gesamt</span>
                        <span className={`tabular-nums ${z.summe < 0 ? 'text-danger' : ''}`}>{euroGenau(z.summe)}</span>
                      </p>
                    )}
                  </div>
                )
              }}
            />
            {/* Linear statt stepAfter: nach dem Ausduennen liegen Punkte mehrere Tage auseinander,
                eine Stufe wuerde den Sprung an die falsche Stelle setzen. Gestapelt mit Minus:
                recharts summiert schlicht auf, die Oberkante ist immer die Gesamtsumme. */}
            {schichten.map((_, i) => (
              <Area
                key={i}
                type="linear"
                dataKey={`s${i}`}
                stackId="konten"
                stroke={farbe(i)}
                strokeWidth={1.5}
                fill={farbe(i)}
                fillOpacity={0.35}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {mehrere && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {reihenfolge.map(i => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: farbe(i) }} />
              {schichten[i].name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
