'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
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
 * Kurve auf die (kleine, feste) Breite, `non-scaling-stroke` haelt die Linie dabei gleich dick.
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
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-8 w-16 shrink-0" aria-hidden>
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

/**
 * Eine kompakte Karte (72 px hoch): links Name, Saldo und 30-Tage-Zeile, rechts die Sparkline.
 * IBAN, Stand und Verfuegbar-Betrag stehen nur noch im `title` (Hover/Fokus), nicht mehr als
 * eigene Zeilen — das haelt die Reihe niedrig, die Angaben gehen aber nicht verloren.
 * Der Finance-Link ist ein eigener 40-px-Streifen rechts: Tap-Ziel gross genug, ohne die Karte
 * zu ueberlagern. Karte und Link liegen nebeneinander statt ineinander (<a> in <button> waere
 * ungueltiges HTML und der Klick loeste beides aus).
 */
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
  const delta = Math.abs(k.delta30) < 0.005 ? 0 : k.delta30
  const hinweis = istSumme
    ? 'Summe aller gebuchten Salden — hebt die Kontoauswahl auf'
    : [
        k.iban,
        k.stand ? `Stand: ${k.stand}` : null,
        k.verfuegbar !== null && k.verfuegbar !== k.gebucht ? `Verfügbar: ${euro(k.verfuegbar)}` : null,
      ].filter(Boolean).join(' · ')

  return (
    <div
      className={`flex h-[72px] w-56 shrink-0 snap-start items-stretch rounded-lg border transition-colors lg:w-auto lg:min-w-0 lg:flex-1 ${
        aktiv ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/40'
      }`}
    >
      <button
        type="button"
        onClick={onWaehlen}
        aria-pressed={aktiv}
        title={hinweis}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-medium text-muted-foreground">{k.name}</span>
            {imMinus && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-danger">
                <span className="size-1.5 rounded-full bg-danger" aria-hidden />
                im Minus
              </span>
            )}
          </span>
          <span className={`block truncate font-mono text-base font-semibold tabular-nums ${imMinus ? 'text-danger' : ''}`}>
            {euro(k.gebucht)}
          </span>
          <span className="block truncate text-[10px] tabular-nums text-muted-foreground">
            30 Tage{' '}
            <span className={delta === 0 ? '' : delta > 0 ? 'font-medium text-success' : 'font-medium text-danger'}>
              {delta > 0 ? '+' : delta < 0 ? '−' : ''}{euro(Math.abs(delta))}
            </span>
          </span>
        </span>
        <Sparkline werte={k.verlauf} negativ={imMinus} />
      </button>

      {k.accountId && (
        <Link
          href={`/finance/accounts/${k.accountId}`}
          title="In Finance öffnen — Kategorien, Verträge, manuelle Buchungen"
          aria-label={`${k.name} in Finance öffnen`}
          className="flex w-10 shrink-0 items-center justify-center rounded-r-lg border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      )}
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
    // min-w-0: ohne das waere dieser Container so breit wie alle Karten zusammen und zoege die
    // SEITE in die Breite; so scrollt nur die Reihe. Ab lg passen alle nebeneinander (flex-1),
    // darunter Scroll-Snap, versteckte Scrollbar, Fades an den Raendern (Muster AnalyseKennzahlen).
    <section aria-label="Konten" className="relative min-w-0">
      <div className="flex gap-3 snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent lg:hidden" />
    </section>
  )
}
