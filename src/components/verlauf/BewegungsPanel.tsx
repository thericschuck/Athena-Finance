'use client'

import { useMemo, useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import {
  bewegungSumme, BEWEGUNG_ZEITRAEUME, ZEITRAUM_MONATE,
  type BewegungMonat, type BewegungZeitraum,
} from '@/lib/verlauf/bewegung'
import { BewegungsChartLazy } from './BewegungsChartLazy'

const LABEL: Record<BewegungZeitraum, string> = { '3m': '3 Mon.', '6m': '6 Mon.', '12m': '12 Mon.', max: 'Alles' }

/** Client-State statt Query-Parameter: alle Monate sind vorberechnet, Umschalten kostet nichts. */
export default function BewegungsPanel({ monate, locale }: { monate: BewegungMonat[]; locale: string }) {
  const [zeitraum, setZeitraum] = useState<BewegungZeitraum>('6m')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const vz = (n: number) => `${n >= 0 ? '+' : '−'}${euro(Math.abs(n))}`

  const n = ZEITRAUM_MONATE[zeitraum]
  const sicht = useMemo(() => (n === null ? monate : monate.slice(-n)), [monate, n])
  const s = useMemo(() => bewegungSumme(monate, n), [monate, n])

  const dauer = s.monate === 1 ? '1 Monat' : `${s.monate} Monaten`

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Warum hat sich mein Vermögen bewegt?
          </p>
          <p className="mt-1 text-sm">
            <span className={`font-semibold tabular-nums ${s.delta >= 0 ? 'text-success' : 'text-danger'}`}>
              {vz(s.delta)}
            </span>{' '}
            in {dauer}: {euro(s.gespart)} gespart, {vz(s.markt)} Markt &amp; Sonstiges.
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {BEWEGUNG_ZEITRAEUME.map(z => (
            <button
              key={z}
              type="button"
              onClick={() => setZeitraum(z)}
              aria-pressed={zeitraum === z}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                zeitraum === z ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {LABEL[z]}
            </button>
          ))}
        </div>
      </div>

      <BewegungsChartLazy monate={sicht} locale={locale} />

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: 'var(--chart-cat-1)' }} />
          Gespart (Einnahmen − Konsum)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: 'var(--chart-cat-2)' }} />
          Markt &amp; Sonstiges (Rest)
        </li>
        <li className="tabular-nums">
          davon Depot/Crypto {vz(s.marktAnlagen)}, übrig {vz(s.marktSonstiges)}
        </li>
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Gespart = Einnahmen minus Konsum aus den Buchungen. Geld, das ins Depot oder in Crypto wandert, zählt
        weder als gespart noch als Gewinn, es wechselt nur den Topf. Der Rest ist Vermögensänderung minus
        gespart und daher ungenau: er enthält neben Kursgewinnen auch Buchungslücken, Forderungen,
        Schuldentilgung und Bewertungsänderungen. Der erste Monat der Aufzeichnung fehlt, der laufende Monat ist unvollständig.
      </p>
    </div>
  )
}
