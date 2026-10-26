import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { KontenKennzahlen } from '@/lib/konten/typen'

/**
 * Schmale Kennzahlen-Leiste der Konten-Seite (Muster: AnalyseKennzahlen): eine Karte mit dünnen
 * Trennlinien statt einer Kachel je Zahl. Am Handy scrollt sie waagerecht (Snap, versteckte
 * Scrollbar, Fades); die Erklärung kommt per Portal-Hover (AnalyseKennzahlInfo), weil ein
 * scrollbarer Container absolut positionierte Karten abschneiden würde. Server-Komponente.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, ton, delta, info,
}: {
  titel: string
  wert: string
  ton?: 'danger'
  delta?: React.ReactNode
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${ton === 'danger' ? 'text-danger' : ''}`}>
          {wert}
        </span>
        {delta}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function KontenKennzahlenLeiste({ k, locale }: { k: KontenKennzahlen; locale: string }) {
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const fremd = k.fremdwaehrung > 0
    ? ` ${k.fremdwaehrung} ${k.fremdwaehrung === 1 ? 'aktives Konto' : 'aktive Konten'} in anderer Währung (z. B. Krypto in BTC) ${k.fremdwaehrung === 1 ? 'steht' : 'stehen'} nicht in den Summen.`
    : ''
  const d = k.delta
  const DeltaIcon = d === null || Math.round(d) === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <section aria-label="Kennzahlen" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Gesamt"
          wert={euro(k.gesamt)}
          ton={k.gesamt < 0 ? 'danger' : undefined}
          info={{
            titel: 'Gesamt',
            zeilen: [['Aktive EUR-Konten', String(k.anzahlAktiv - k.fremdwaehrung)], ['Summe', euro(k.gesamt, 2)]],
            text: `Summe der Salden aller aktiven Konten in Euro. Bankkonten zählen mit dem Saldo der Bank, die übrigen mit der Summe ihrer Buchungen. Inaktive Konten zählen nicht.${fremd}`,
          }}
        />
        <Zelle
          titel="Liquide"
          wert={euro(k.liquide)}
          ton={k.liquide < 0 ? 'danger' : undefined}
          info={{
            titel: 'Liquide',
            zeilen: [['Summe', euro(k.liquide, 2)]],
            text: 'Girokonten, Bargeld und Sparkonten: Geld, das du kurzfristig verfügbar hast.',
          }}
        />
        <Zelle
          titel="Gebunden"
          wert={euro(k.gebunden)}
          info={{
            titel: 'Gebunden',
            zeilen: [['Summe', euro(k.gebunden, 2)]],
            text: 'Bausparverträge, Depots, Geschäftsanteile und Krypto, soweit in Euro geführt: Geld, das angelegt ist und nicht sofort verfügbar.',
          }}
        />
        {k.imMinus > 0 && (
          <Zelle
            titel="Im Minus"
            wert={`−${euro(k.imMinus)}`}
            ton="danger"
            info={{
              titel: 'Im Minus',
              zeilen: [['Summe', `−${euro(k.imMinus, 2)}`]],
              text: 'Summe aller negativen Salden (Dispo, Kreditkarte, überzogene Konten). Sie sind im Gesamt bereits abgezogen.',
            }}
          />
        )}
        <Zelle
          titel="Δ im Zeitraum"
          wert={d === null ? '—' : euro(Math.abs(d))}
          delta={
            d === null ? undefined : (
              <span className={`inline-flex items-center ${d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                <DeltaIcon className="size-3.5" aria-hidden />
                <span className="sr-only">{d > 0 ? 'plus' : d < 0 ? 'minus' : 'unverändert'}</span>
              </span>
            )
          }
          info={{
            titel: 'Veränderung im Zeitraum',
            zeilen: d === null ? [] : [['Summe', `${d > 0 ? '+' : d < 0 ? '−' : ''}${euro(Math.abs(d), 2)}`]],
            text: `Summe der Veränderungen aller aktiven Konten über den gewählten Zeitraum (letzter minus erster Wert des Verlaufs). Der Zeitraum wird oben gewählt.${d === null ? ' Es gibt noch keine Historie.' : ''}${fremd}`,
          }}
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
