import { fmtCurrency } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { KategorienKennzahlen } from '@/lib/kategorien/berechnen'
import type { Nutzung } from '@/lib/kategorien/berechnen'

/**
 * Schmale Kennzahlen-Leiste der Kategorien-Seite (Muster: KontenKennzahlenLeiste): eine Karte mit
 * dünnen Trennlinien. Am Handy scrollt sie waagerecht in ihrem eigenen Container (Snap, versteckte
 * Scrollbar, Fades); die Erklärung kommt per Portal-Hover (AnalyseKennzahlInfo). Server-Komponente.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, zusatz, ton, info,
}: {
  titel: string
  wert: string
  zusatz?: string
  ton?: 'danger' | 'success'
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
            ton === 'danger' ? 'text-danger' : ton === 'success' ? 'text-success' : ''
          }`}
        >
          {wert}
        </span>
        {zusatz && <span className="text-xs text-muted-foreground">{zusatz}</span>}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function KategorienKennzahlenLeiste({
  k, summe, zeitraum, locale,
}: {
  k: KategorienKennzahlen
  /** Summe aller Kategorien im Zeitraum (nur echte Flüsse). */
  summe: Nutzung
  zeitraum: string
  locale: string
}) {
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  // „Ausgaben ohne Rolle“ ist nur eine Meldung wert, wenn die Steuer überhaupt genutzt wird (sonst wären es alle).
  const zeigeRolleHinweis = k.mitRolle > 0 && k.ausgabenOhneRolle > 0

  return (
    <section aria-label="Kennzahlen" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Kategorien"
          wert={String(k.gesamt)}
          zusatz={`${k.haupt} Haupt · ${k.unter} Unter`}
          info={{
            titel: 'Kategorien',
            zeilen: [['Gesamt', String(k.gesamt)], ['Hauptkategorien', String(k.haupt)], ['Unterkategorien', String(k.unter)]],
            text: 'Anzahl aller Kategorien, aufgeteilt in Haupt- und Unterkategorien.',
          }}
        />
        <Zelle
          titel="Ungenutzt"
          wert={String(k.ungenutzt)}
          info={{
            titel: 'Ungenutzt',
            zeilen: [['Ohne Buchung', String(k.ungenutzt)]],
            text: 'Kategorien, denen keine einzige Buchung zugeordnet ist (bei Hauptkategorien auch keine in ihren Unterkategorien). Der Filter „Ungenutzte“ zeigt sie an; zum Aufräumen eignet sich Bearbeiten oder Löschen.',
          }}
        />
        <Zelle
          titel={`Ausgaben ${zeitraum}`}
          wert={euro(summe.ausgaben)}
          ton="danger"
          info={{
            titel: `Ausgaben im Zeitraum (${zeitraum})`,
            zeilen: [['Summe', fmtCurrency(summe.ausgaben, 'EUR', locale, { fractionDigits: 2 })]],
            text: 'Echte Ausgaben aller Kategorien im gewählten Zeitraum. Umbuchungen, Anfangsbestände, Anlagen und Forderungen zählen nicht (wie überall in der App).',
          }}
        />
        <Zelle
          titel={`Einnahmen ${zeitraum}`}
          wert={euro(summe.einnahmen)}
          ton="success"
          info={{
            titel: `Einnahmen im Zeitraum (${zeitraum})`,
            zeilen: [['Summe', fmtCurrency(summe.einnahmen, 'EUR', locale, { fractionDigits: 2 })]],
            text: 'Echte Einnahmen aller Kategorien im gewählten Zeitraum, nach derselben Fluss-Regel wie die Ausgaben.',
          }}
        />
        {zeigeRolleHinweis && (
          <Zelle
            titel="Ohne Steuerrolle"
            wert={String(k.ausgabenOhneRolle)}
            info={{
              titel: 'Ausgaben ohne Steuerrolle',
              zeilen: [['Kategorien', String(k.ausgabenOhneRolle)]],
              text: 'Ausgabekategorien mit Buchungen, denen (auch über die Hauptkategorie) keine steuerliche Rolle zugeordnet ist. Die Steuerseite führt ihre Buchungen als „unzugeordnet“. Rolle setzt du über Bearbeiten.',
            }}
          />
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
