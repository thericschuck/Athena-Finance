import { fmtCurrency } from '@/lib/format'
import { formatMonatJahr, type SchuldenKennzahlen } from '@/lib/schulden/berechnen'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'

/**
 * Schmale Kennzahlen-Leiste der Schulden-Seite (Muster: KontenKennzahlenLeiste): eine Karte mit
 * dünnen Trennlinien, am Handy waagerecht scrollbar im eigenen Container; Erklärungen per
 * Portal-Hover (AnalyseKennzahlInfo). Zeigt nur, was die Daten hergeben. Server-Komponente.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

type Ton = 'danger' | 'success'

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
      <span className={`mt-0.5 text-base font-semibold tabular-nums tracking-tight sm:text-lg ${ton === 'danger' ? 'text-danger' : ton === 'success' ? 'text-success' : ''}`}>
        {wert}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function SchuldenKennzahlenLeiste({ k, locale }: { k: SchuldenKennzahlen; locale: string }) {
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const fremd = k.fremdwaehrung > 0
    ? ` ${k.fremdwaehrung} aktive ${k.fremdwaehrung === 1 ? 'Eintrag' : 'Einträge'} in anderer Währung ${k.fremdwaehrung === 1 ? 'steht' : 'stehen'} nicht in den Summen.`
    : ''
  const zeigeEnde = k.schulde > 0

  return (
    <section aria-label="Kennzahlen" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Ich schulde"
          wert={euro(k.schulde)}
          ton={k.schulde > 0 ? 'danger' : undefined}
          info={{
            titel: 'Ich schulde',
            zeilen: [['Offen', euro(k.schulde, 2)]],
            text: `Restschuld aller aktiven Schulden, die ich bezahlen muss (Euro).${fremd}`,
          }}
        />
        {k.geschuldet > 0 && (
          <Zelle
            titel="Mir geschuldet"
            wert={euro(k.geschuldet)}
            ton="success"
            info={{
              titel: 'Mir wird geschuldet',
              zeilen: [['Offen', euro(k.geschuldet, 2)]],
              text: 'Geld, das ich verliehen habe und noch zurückbekomme (aktive Einträge in Euro).',
            }}
          />
        )}
        {k.mitRate > 0 && (
          <Zelle
            titel="Rate / Monat"
            wert={euro(k.monatlicheLast)}
            info={{
              titel: 'Monatliche Last',
              zeilen: [['Summe der Raten', euro(k.monatlicheLast, 2)], ['Schulden mit Rate', String(k.mitRate)]],
              text: 'Summe der Monatsraten meiner aktiven Schulden.',
            }}
          />
        )}
        {k.zinsenProJahr > 0 && (
          <Zelle
            titel="Zinsen / Jahr"
            wert={euro(k.zinsenProJahr)}
            ton="danger"
            info={{
              titel: 'Zinsen pro Jahr',
              zeilen: [['Summe', euro(k.zinsenProJahr, 2)]],
              text: 'Restschuld mal Zinssatz, einfach gerechnet (ohne Zinseszins) und nur für meine aktiven Schulden mit Zinssatz.',
            }}
          />
        )}
        {zeigeEnde && (
          <Zelle
            titel="Schuldenfrei"
            wert={k.schuldenfrei ? `ca. ${formatMonatJahr(k.schuldenfrei)}` : '—'}
            info={{
              titel: 'Voraussichtlich schuldenfrei',
              zeilen: k.schuldenfrei ? [['Monat', formatMonatJahr(k.schuldenfrei)]] : [],
              text: k.schuldenfrei
                ? 'Wenn alle Raten weiter wie eingetragen laufen (Zinsen monatlich, Satz geteilt durch zwölf). Späteste Schuld zählt.'
                : `Nicht bestimmbar: ${k.ohneEnde} aktive ${k.ohneEnde === 1 ? 'Schuld hat' : 'Schulden haben'} keine Monatsrate oder eine Rate, die die Zinsen nicht deckt.`,
            }}
          />
        )}
        {k.getilgt > 0 && (
          <Zelle
            titel="Getilgt"
            wert={euro(k.getilgt)}
            ton="success"
            info={{
              titel: 'Bereits getilgt',
              zeilen: [['Getilgt', euro(k.getilgt, 2)], ['Ursprünglich', euro(k.urspruenglich, 2)]],
              text: 'Summe der Tilgungen meiner Schulden, aktive und abgeschlossene (Euro). Verliehenes Geld zählt nicht.',
            }}
          />
        )}
        {k.ueberfaellig > 0 && (
          <Zelle
            titel="Überfällig"
            wert={String(k.ueberfaellig)}
            ton="danger"
            info={{
              titel: 'Überfällig',
              text: 'Aktive Einträge, deren Fälligkeitsdatum vor heute liegt.',
            }}
          />
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
