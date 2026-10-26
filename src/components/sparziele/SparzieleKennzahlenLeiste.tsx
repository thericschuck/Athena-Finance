import { fmtCurrency, fmtDate } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { prozent, type Kennzahlen } from '@/lib/sparziele/berechnen'

/**
 * Schmale Kennzahlen-Leiste der Sparziele (Muster: KontenKennzahlenLeiste): eine Karte mit dünnen
 * Trennlinien, am Handy waagerecht scrollbar im eigenen Container; Erklärung per Portal-Hover.
 * Server-Komponente.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, ton, nebenwert, info,
}: {
  titel: string
  wert: string
  ton?: 'danger' | 'success'
  nebenwert?: string
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${ton === 'danger' ? 'text-danger' : ton === 'success' ? 'text-success' : ''}`}>
          {wert}
        </span>
        {nebenwert && <span className="text-xs text-muted-foreground">{nebenwert}</span>}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function SparzieleKennzahlenLeiste({ k, locale, dateFormat }: { k: Kennzahlen; locale: string; dateFormat: string }) {
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const datum = (d: string) => fmtDate(new Date(`${d}T12:00:00`), dateFormat)
  const pct = prozent(k.gespart, k.gesamtziel)

  return (
    <section aria-label="Kennzahlen" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Ziele"
          wert={`${k.offen} offen`}
          nebenwert={k.erreicht > 0 ? `${k.erreicht} erreicht` : undefined}
          info={{
            titel: 'Ziele',
            zeilen: [['Offen', String(k.offen)], ['Erreicht', String(k.erreicht)], ['Beendet ohne Erreichen', String(k.beendet)]],
            text: 'Offen sind alle Ziele, die du noch verfolgst. Erreicht sind abgeschlossene Ziele mit vollem Betrag; beendet sind abgeschlossene Ziele, bei denen der Betrag nicht voll wurde.',
          }}
        />
        {k.offen > 0 && (
          <>
            <Zelle
              titel="Gesamtziel"
              wert={euro(k.gesamtziel)}
              info={{
                titel: 'Gesamtziel',
                zeilen: [['Summe', euro(k.gesamtziel, 2)], ['Noch offen', euro(k.rest, 2)]],
                text: 'Summe der Zielbeträge aller offenen Sparziele.',
              }}
            />
            <Zelle
              titel="Gespart"
              wert={euro(k.gespart)}
              nebenwert={`${pct} %`}
              info={{
                titel: 'Bereits gespart',
                zeilen: [['Summe', euro(k.gespart, 2)], ['Anteil am Gesamtziel', `${pct} %`]],
                text: 'Summe der Stände offener Sparziele, je Ziel höchstens bis zum Zielbetrag. Der Stand ist von dir gepflegt (Einzahlungen oder Bearbeiten) und nicht mit einem Konto verknüpft.',
              }}
            />
            <Zelle
              titel="Sparrate"
              wert={k.rateGesamt > 0 ? `${euro(k.rateGesamt)}/Mon.` : '—'}
              info={{
                titel: 'Sparrate gesamt',
                zeilen: k.rateGesamt > 0 ? [['Pro Monat', euro(k.rateGesamt, 2)]] : [],
                text: 'Summe der monatlichen Sparraten aller offenen Ziele. Die Rate ist ein Plan; sie bucht nichts automatisch.',
              }}
            />
            <Zelle
              titel="Nächstes Zieldatum"
              wert={k.naechstesDatum ? datum(k.naechstesDatum.datum) : '—'}
              info={{
                titel: 'Nächstes Zieldatum',
                zeilen: k.naechstesDatum ? [['Ziel', k.naechstesDatum.name]] : [],
                text: 'Das früheste Zieldatum unter den offenen Zielen, das noch nicht vorbei ist.',
              }}
            />
            {k.kritisch > 0 && (
              <Zelle
                titel="Achtung"
                wert={`${k.kritisch} ${k.kritisch === 1 ? 'Ziel' : 'Ziele'}`}
                ton="danger"
                info={{
                  titel: 'Rate reicht nicht',
                  zeilen: [['Betroffen', String(k.kritisch)]],
                  text: 'Bei diesen Zielen reicht die Sparrate nicht bis zum Zieldatum (mehr als ein Monat zu spät) oder das Zieldatum ist schon vorbei.',
                }}
              />
            )}
          </>
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
