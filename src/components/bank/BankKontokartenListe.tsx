'use client'

import Link from 'next/link'
import { ArrowUpRight, Check, CreditCard, Layers } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { fmtCurrency } from '@/lib/format'
import { normIban } from '@/lib/bank/scope'

/** Fertig gerechnete Karte; die Rekonstruktion aus den Buchungen passiert auf dem Server. */
export interface Kontokarte {
  /** IBAN wie in der Datenbank; leer bei der Summenkarte. */
  iban: string
  name: string
  accountId: string | null
  gebucht: number
  verfuegbar: number | null
  /** Bereits formatiertes Datum des letzten Abrufs. */
  stand: string | null
  /** Tagesendsalden der letzten Tage, aelteste zuerst. */
  verlauf: number[]
  /** Aenderung des gebuchten Saldos gegenueber vor 30 Tagen. */
  delta30: number
}

/**
 * Sparkline als reines SVG: kein Recharts fuer drei Mini-Kurven (das Bundle laedt sonst
 * schon mit den Karten, nicht erst mit dem Verlauf). `preserveAspectRatio="none"` streckt die
 * Kurve auf die Kartenbreite, `non-scaling-stroke` haelt die Linie dabei gleich dick.
 * Bei einer flachen Reihe (min = max) wird eine Mittellinie gezeichnet statt durch null zu
 * teilen. Die Nulllinie erscheint nur, wenn die Reihe sie kreuzt oder darunter liegt.
 */
function Sparkline({ werte, negativ }: { werte: number[]; negativ: boolean }) {
  const B = 100
  const H = 28
  const min = Math.min(...werte)
  const max = Math.max(...werte)
  const spanne = max - min
  const y = (v: number) => (spanne === 0 ? H / 2 : H - 2 - ((v - min) / spanne) * (H - 4))
  const x = (i: number) => (werte.length < 2 ? 0 : (i / (werte.length - 1)) * B)
  const linie = werte.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const farbe = negativ ? 'var(--danger)' : 'var(--chart-accent)'
  const zeigeNull = spanne > 0 && min < 0

  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      {zeigeNull && (
        <line
          x1={0} x2={B} y1={y(0)} y2={y(0)}
          stroke="var(--muted-foreground)" strokeOpacity={0.4} strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polygon points={`0,${H} ${linie} ${B},${H}`} fill={farbe} fillOpacity={0.12} />
      <polyline
        points={linie} fill="none" stroke={farbe} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Karte({
  k, aktiv, euro, onWaehlen,
}: {
  k: Kontokarte
  aktiv: boolean
  euro: (n: number) => string
  onWaehlen: () => void
}) {
  const imMinus = k.gebucht < 0
  const istSumme = k.iban === ''
  const Icon = istSumme ? Layers : CreditCard

  return (
    // Karte und Link nebeneinander statt ineinander: ein <a> in einem <button> ist ungueltiges
    // HTML, und der Klick wuerde beides ausloesen.
    <div
      className={`relative rounded-lg border transition-colors ${
        aktiv ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/40'
      }`}
    >
      <button
        type="button"
        onClick={onWaehlen}
        aria-pressed={aktiv}
        className="w-full space-y-1 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2 pr-14 text-muted-foreground">
          <Icon className="size-4 shrink-0" />
          <span className="truncate text-xs font-medium">{k.name}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className={`font-mono text-xl font-semibold tabular-nums ${imMinus ? 'text-danger' : ''}`}>
            {euro(k.gebucht)}
          </p>
          {imMinus && (
            <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
              im Minus
            </span>
          )}
        </div>

        {k.verfuegbar !== null && k.verfuegbar !== k.gebucht && (
          <p className="text-xs text-muted-foreground">
            Verfügbar: <span className="tabular-nums">{euro(k.verfuegbar)}</span>
          </p>
        )}

        <div className="pt-1">
          <Sparkline werte={k.verlauf} negativ={imMinus} />
          <p className="mt-0.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>90 Tage</span>
            <span className="tabular-nums">
              30 Tage:{' '}
              <span
                className={
                  Math.abs(k.delta30) < 0.005 ? '' : k.delta30 > 0 ? 'font-medium text-success' : 'font-medium text-danger'
                }
              >
                {k.delta30 > 0.005 ? '+' : k.delta30 < -0.005 ? '−' : ''}{euro(Math.abs(k.delta30))}
              </span>
            </span>
          </p>
        </div>

        {!istSumme && <p className="font-mono text-xs text-muted-foreground">{k.iban}</p>}
        <p className="text-xs text-muted-foreground">
          {istSumme ? 'Summe aller gebuchten Salden · hebt die Kontoauswahl auf' : `Stand: ${k.stand}`}
        </p>
      </button>

      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {aktiv && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        )}
        {k.accountId && (
          <Link
            href={`/finance/accounts/${k.accountId}`}
            title="In Finance öffnen — Kategorien, Verträge, manuelle Buchungen"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Finance
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
    </div>
  )
}

export function BankKontokartenListe({
  karten, summe, locale,
}: {
  karten: Kontokarte[]
  summe: Kontokarte
  locale: string
}) {
  const filters = useUrlFilters()
  // Aus dem Provider, nicht aus useSearchParams: so ist die Karte sofort markiert, noch bevor
  // der Server mit den neu gefilterten Daten antwortet.
  const gewaehlt = filters.get('konto')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {karten.length > 1 && (
        <Karte k={summe} aktiv={!gewaehlt} euro={euro} onWaehlen={() => filters.set('konto', null)} />
      )}
      {karten.map(k => {
        const aktiv = gewaehlt !== null && normIban(gewaehlt) === normIban(k.iban)
        return (
          <Karte
            key={k.iban}
            k={k}
            aktiv={aktiv}
            euro={euro}
            // Zweiter Klick auf die aktive Karte hebt die Auswahl wieder auf.
            onWaehlen={() => filters.set('konto', aktiv ? null : k.iban)}
          />
        )
      })}
    </div>
  )
}
