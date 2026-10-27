import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { kennzahlen as nwKennzahlen } from '@/lib/verlauf/networth'
import {
  liquiditaetIn, liquiditaetIst, naechsterTermin, veraenderungNachTagen,
} from '@/lib/dashboard/kennzahlen'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DashKennzahlInfo } from './DashKennzahlInfo'

/**
 * Schmale Kennzahlenleiste des Dashboards: Net Worth (mit Veränderung zu vor 30 Tagen), Monat netto,
 * Sparquote, Liquidität (mit Prognose in 30 Tagen) und nächster Termin.
 *
 * Eine Karte mit dünnen Trennlinien (Muster: AnalyseKennzahlen). Ab lg stehen alle Zellen nebeneinander,
 * darunter scrollt nur die Leiste waagerecht (Snap, Fades); die Seite selbst wird nie breiter.
 *
 * Zahlen: Net Worth und Posten kommen aus dem Kern der Seite, also dieselben wie überall (Net Worth =
 * Summe der Posten). Die Veränderung rechnet auf den Snapshots des Kerns; fehlt ein Stand rund um den
 * Stichtag, gibt es kein Delta statt einer Zahl über einen anderen Zeitraum. Die Prognose ist die
 * geteilte Dashboard-Prognose (Szenario inkl. Annahmen); fehlt sie, zeigt die Liquidität nur den Ist-Wert.
 */

type Ton = 'gut' | 'schlecht' | 'neutral'

interface DeltaDaten {
  richtung: 'auf' | 'ab' | 'gleich'
  text: string
  ton: Ton
}

function Delta({ d }: { d: DeltaDaten | null }) {
  if (!d) return null
  const Icon = d.richtung === 'auf' ? ArrowUpRight : d.richtung === 'ab' ? ArrowDownRight : Minus
  const farbe = d.ton === 'gut' ? 'text-success' : d.ton === 'schlecht' ? 'text-danger' : 'text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${farbe}`}>
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{d.richtung === 'auf' ? 'plus' : d.richtung === 'ab' ? 'minus' : 'unverändert'}</span>
      {d.text}
    </span>
  )
}

const ZELLE =
  'flex h-16 min-w-0 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40 lg:flex-1'

function Zelle({
  titel, wert, delta, ton, info, href, extra,
}: {
  titel: string
  wert: React.ReactNode
  delta?: React.ReactNode
  ton?: 'success' | 'danger'
  info: { titel: string; zeilen?: [string, string][]; text: string }
  href?: string
  extra?: string
}) {
  return (
    <DashKennzahlInfo className={`${ZELLE} ${href ? 'cursor-pointer hover:bg-accent/30' : ''} ${extra ?? ''}`} href={href} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
          ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''
        }`}>
          {wert}
        </span>
        {delta}
      </span>
    </DashKennzahlInfo>
  )
}

export async function DashKennzahlen({ kern }: DashAbschnittProps) {
  const prognoseBasis = await ladeDashPrognose(kern.scopeCtx, kern.heute)
  const prognose = prognoseBasis?.szenario ?? null

  const { locale, monat, buckets, nichtImNetWorth } = kern
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const vz = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
  const signiert = (n: number, d = 0) => `${vz(Math.round(n * 10 ** d) / 10 ** d)}${euro(Math.abs(n), d)}`
  const tonVon = (n: number): 'success' | 'danger' | undefined =>
    Math.round(n) === 0 ? undefined : n > 0 ? 'success' : 'danger'

  // ── Net Worth ──────────────────────────────────────────────────────────────────────────
  const d30 = veraenderungNachTagen(kern.snapshots, kern.heute, 30)
  const nw = nwKennzahlen(kern.snapshots, kern.heute)
  const deltaZeile = (name: string, d: { betrag: number; prozent: number | null } | null): [string, string][] =>
    d ? [[name, `${signiert(d.betrag)}${d.prozent === null ? '' : ` (${vz(d.prozent)}${Math.abs(d.prozent).toLocaleString(locale, { maximumFractionDigits: 1 })} %)`}`]] : []
  const nwDelta: DeltaDaten | null = d30
    ? {
        richtung: Math.round(d30.betrag) > 0 ? 'auf' : Math.round(d30.betrag) < 0 ? 'ab' : 'gleich',
        text: `${vz(Math.round(d30.betrag))}${euro(Math.abs(d30.betrag))}`,
        ton: Math.round(d30.betrag) === 0 ? 'neutral' : d30.betrag > 0 ? 'gut' : 'schlecht',
      }
    : null

  // ── Liquidität ─────────────────────────────────────────────────────────────────────────
  const liqIst = liquiditaetIst(kern.konten)
  const liq30 = prognose ? liquiditaetIn(prognose.tage, kern.heute, 30) : null
  const kurzDatum = (d: string) => fmtDate(d, kern.dateFormat)

  // ── Termin ─────────────────────────────────────────────────────────────────────────────
  const termin = naechsterTermin(prognose?.termine ?? null, kern.kuendbar, kern.heute)
  const inTagen = (n: number) =>
    n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 0 ? `${Math.abs(n)} T. überfällig` : `in ${n} T.`

  return (
    <section aria-label="Kennzahlen" className="relative min-w-0 rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Net Worth"
          href="/analyse/verlauf"
          wert={euro(kern.netWorth)}
          delta={nwDelta ? <Delta d={nwDelta} /> : undefined}
          info={{
            titel: 'Net Worth',
            zeilen: [
              ...(d30 ? deltaZeile('Seit 30 Tagen', d30) : [['Veränderung', 'zu wenig Verlauf'] as [string, string]]),
              ...deltaZeile('Seit 3 Monaten', nw.monate3),
              ...deltaZeile('Seit 12 Monaten', nw.monate12),
              ...deltaZeile('Seit Jahresanfang', nw.ytd),
              ['Posten', ''],
              ['Konten', euro(buckets.konten)],
              ['Geschäftsanteile', euro(buckets.geschaeftsanteile)],
              ['Depot', euro(buckets.depot)],
              ['Krypto', euro(buckets.krypto)],
              ['Nicht im Net Worth', ''],
              ['Sparziele', euro(nichtImNetWorth.sparziele)],
              ['Ich schulde', euro(nichtImNetWorth.ichSchulde)],
              ['Mir geschuldet', euro(nichtImNetWorth.mirGeschuldet)],
            ],
            text: 'Konten, Geschäftsanteile, Depot und Krypto zusammen. Sparziele und offene Beträge stehen daneben und zählen nicht mit. Klick öffnet den Verlauf.',
          }}
        />
        <Zelle
          titel="Monat netto"
          wert={monat.leer ? '—' : signiert(monat.netto)}
          ton={monat.leer ? undefined : tonVon(monat.netto)}
          info={{
            titel: `Monat netto, ${monat.label}`,
            zeilen: [
              ['Einnahmen', euro(monat.einnahmen)],
              ['Ausgaben', euro(monat.ausgaben)],
              ['Konsum-Saldo', signiert(monat.echt.income - monat.echt.expense)],
              ['Anlagen (netto)', signiert(monat.anlage.income - monat.anlage.expense)],
              ['Forderungen (netto)', signiert(monat.forderung.income - monat.forderung.expense)],
            ],
            text: 'Einnahmen minus Ausgaben im laufenden Monat, nicht der Kontostand. Geld, das in Anlagen geht, ist Sparen und steht darunter als eigener Anteil; ein Minus dort heißt: angelegt.',
          }}
        />
        <Zelle
          titel="Sparquote"
          wert={monat.sparquote === null ? '—' : `${Math.round(monat.sparquote).toLocaleString(locale)} %`}
          ton={monat.sparquote === null ? undefined : monat.sparquote >= 0 ? 'success' : 'danger'}
          info={{
            titel: 'Sparquote',
            zeilen: monat.sparquote === null
              ? [['Hinweis', 'keine Einnahmen']]
              : [['Konsum', euro(monat.konsum)], ['Echte Einnahmen', euro(monat.echt.income)]],
            text: 'Anteil der Einnahmen, der nach den Konsumausgaben übrig bleibt, im laufenden Monat. Geld, das in Anlagen fließt, zählt als Sparen und nicht als Ausgabe.',
          }}
        />
        <Zelle
          titel="Liquidität"
          wert={euro(liqIst)}
          delta={liq30 ? (
            <span className={`text-[11px] font-medium tabular-nums ${liq30.wert < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
              30 T. ≈ {euro(Math.round(liq30.wert / 10) * 10)}
            </span>
          ) : undefined}
          info={{
            titel: 'Liquidität',
            zeilen: [
              ['Heute', euro(liqIst)],
              ...(liq30 ? [[`In 30 Tagen (${kurzDatum(liq30.datum)})`, `≈ ${euro(Math.round(liq30.wert / 10) * 10)}`] as [string, string]] : []),
              ...(liq30 ? [['Bereich (80 %)', `${euro(Math.round(liq30.unten / 10) * 10)} bis ${euro(Math.round(liq30.oben / 10) * 10)}`] as [string, string]] : []),
              ...(prognose ? [
                ['Erwarteter Tiefpunkt', `${euro(Math.round(prognose.tiefpunkt.betrag / 10) * 10)} am ${kurzDatum(prognose.tiefpunkt.datum)}`] as [string, string],
                ['Im ungünstigen Fall', `${euro(Math.round(prognose.risikoTiefpunkt.betrag / 10) * 10)} am ${kurzDatum(prognose.risikoTiefpunkt.datum)}`] as [string, string],
              ] : []),
            ],
            text: prognose
              ? 'Giro-, Spar- und Bargeldkonten zusammen. Die Prognose lernt aus deinen Buchungen und kennt Verträge und Termine; der Bereich ist der, in dem 8 von 10 Verläufen liegen.'
              : 'Giro-, Spar- und Bargeldkonten zusammen. Die Prognose ist gerade nicht verfügbar.',
          }}
        />
        <Zelle
          titel="Nächster Termin"
          extra="lg:max-w-[22%]"
          wert={termin ? <span className="block max-w-[10rem] truncate text-sm sm:text-base">{termin.name}</span> : '—'}
          delta={termin ? (
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {termin.betrag !== null ? `${signiert(termin.betrag)} · ` : ''}{inTagen(termin.tage)}
            </span>
          ) : undefined}
          info={{
            titel: termin ? termin.name : 'Nächster Termin',
            zeilen: termin
              ? [
                  [termin.art === 'zahlung' ? 'Fällig' : 'Kündigen bis', kurzDatum(termin.datum)],
                  ...(termin.betrag !== null ? [['Betrag', signiert(termin.betrag, 2)] as [string, string]] : []),
                ]
              : [],
            text: termin
              ? (termin.art === 'zahlung'
                  ? 'Die nächste bekannte Zahlung aus Verträgen und Terminen der Prognose. Ein Minus ist ein Abfluss.'
                  : 'Die Prognose ist nicht verfügbar; gezeigt wird die nächste ablaufende Kündigungsfrist.')
              : 'Keine bekannten Termine in nächster Zeit.',
          }}
        />
      </div>
      {/* Fades zeigen am Handy, dass die Leiste weiterscrollt; ab lg passt alles. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
