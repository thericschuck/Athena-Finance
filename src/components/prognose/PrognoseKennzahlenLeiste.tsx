import { fmtCurrency } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { PrognoseKennzahlen } from '@/lib/prognose-seite/berechnen'

/**
 * Schmale Kennzahlen-Leiste der Prognose (Muster: KontenKennzahlenLeiste): eine Karte mit dünnen
 * Trennlinien. Am Handy scrollt sie waagerecht innerhalb der Karte (der Seiten-Container bleibt
 * unverrückbar); die Erklärung kommt per Portal-Hover. Server-Komponente, alle Zahlen kommen aus der
 * Prognose-Engine (lib/forecast), hier wird nichts neu gerechnet.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

type Ton = 'danger' | 'success' | undefined

function Zelle({
  titel, wert, ton, info,
}: {
  titel: string
  wert: string
  ton?: Ton
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span
        className={`mt-0.5 text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
          ton === 'danger' ? 'text-danger' : ton === 'success' ? 'text-success' : ''
        }`}
      >
        {wert}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function PrognoseKennzahlenLeiste({
  k, locale, datumText, monate, risikoBetrag, risikoDatum,
}: {
  k: PrognoseKennzahlen
  locale: string
  /** Datum `YYYY-MM-DD` im Format der Einstellungen. */
  datumText: (iso: string) => string
  monate: number
  risikoBetrag: number
  risikoDatum: string
}) {
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const mitVorzeichen = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${euro(Math.abs(n))}`
  const ton = (n: number): Ton => (n < 0 ? 'danger' : undefined)
  const monatText = (iso: string) =>
    new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })

  return (
    <section aria-label="Kennzahlen" className="relative min-w-0 rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Liquidität heute"
          wert={euro(k.stand)}
          ton={ton(k.stand)}
          info={{
            titel: 'Liquidität heute',
            zeilen: [['Summe', euro(k.stand, 2)]],
            text: 'Giro-, Spar- und Bargeldkonten zusammen: Geld, das du kurzfristig verfügbar hast. Hier beginnt die Prognose.',
          }}
        />
        <Zelle
          titel="Tiefster Stand"
          wert={euro(k.tiefpunkt.betrag)}
          ton={ton(k.tiefpunkt.betrag)}
          info={{
            titel: 'Tiefster erwarteter Stand',
            zeilen: [
              ['Am', datumText(k.tiefpunkt.datum)],
              ['In 1 von 10 Verläufen bis', euro(risikoBetrag)],
              ['Dann am', datumText(risikoDatum)],
            ],
            text: `Niedrigste erwartete Liquidität in den nächsten ${monate} Monaten. Der Wert für „1 von 10“ ist die untere Grenze des Schwankungsbereichs.`,
          }}
        />
        <Zelle
          titel={k.ende ? `Stand ${monatText(k.ende.datum)}` : 'Stand am Ende'}
          wert={k.ende ? euro(k.ende.liquiditaet) : '–'}
          ton={k.ende ? ton(k.ende.liquiditaet) : undefined}
          info={{
            titel: 'Liquidität am Ende',
            zeilen: k.ende ? [['Am', datumText(k.ende.datum)], ['Liquidität', euro(k.ende.liquiditaet, 2)], ['Nettovermögen', euro(k.ende.vermoegen, 2)]] : [],
            text: `Erwartete Liquidität am letzten Tag des Zeitraums (${monate} Monate). Das Nettovermögen steht in der Karte.`,
          }}
        />
        <Zelle
          titel="Ø Vermögen / Monat"
          wert={k.vermoegenProMonat === null ? '–' : mitVorzeichen(k.vermoegenProMonat)}
          ton={k.vermoegenProMonat === null ? undefined : k.vermoegenProMonat < 0 ? 'danger' : 'success'}
          info={{
            titel: 'Ø Veränderung des Vermögens',
            zeilen: k.liquiditaetProMonat === null ? [] : [['Liquidität je Monat', mitVorzeichen(k.liquiditaetProMonat)]],
            text: 'Wie stark das Nettovermögen im Schnitt je Monat wächst, inklusive Verträge und Annahmen. Anlagen sind ein Tausch und zählen nicht als Ausgabe; Kursgewinne sind nicht eingerechnet. Die Liquidität sinkt schneller, wenn du Geld anlegst.',
          }}
        />
        <Zelle
          titel="Reicht bis"
          wert={k.erstesMinus ? datumText(k.erstesMinus) : k.stand < 0 ? 'schon im Minus' : 'Ganzer Zeitraum'}
          ton={k.erstesMinus || k.stand < 0 ? 'danger' : 'success'}
          info={{
            titel: 'Reicht das Geld?',
            zeilen: [
              ['Erwartet im Minus ab', k.erstesMinus ? datumText(k.erstesMinus) : 'nie'],
              ['In 1 von 10 Verläufen ab', k.erstesRisikoMinus ? datumText(k.erstesRisikoMinus) : 'nie'],
            ],
            text: 'Erster Tag, an dem die erwartete Liquidität unter 0 € fällt. „1 von 10“ ist der pessimistischere Rand des Schwankungsbereichs, etwa wenn ein großer Einzelposten dazwischenkommt.',
          }}
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
