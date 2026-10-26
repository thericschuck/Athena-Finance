import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { TrefferSummen } from '@/lib/transaktionen/berechnen'

/**
 * Kennzahlenleiste über die TREFFER des Filters (nicht nur die angezeigte Seite). Eine Karte mit dünnen
 * Trennlinien (Muster: KontenKennzahlenLeiste); am Handy scrollt sie waagerecht. Die Erklärungen kommen
 * als Portal-Hover (AnalyseKennzahlInfo). Server-Komponente.
 */

const ZELLE =
  'flex h-14 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, ton, delta, info,
}: {
  titel: string
  wert: string
  ton?: 'plus' | 'minus'
  delta?: React.ReactNode
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
            ton === 'plus' ? 'text-success' : ton === 'minus' ? 'text-danger' : ''
          }`}
        >
          {wert}
        </span>
        {delta}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function TransaktionenKennzahlen({
  summen, gefiltert, locale,
}: {
  summen: TrefferSummen & { gekappt: boolean }
  gefiltert: boolean
  locale: string
}) {
  const euro = (n: number, d = 2) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const n = summen.netto
  const NettoIcon = Math.round(n * 100) === 0 ? Minus : n > 0 ? ArrowUpRight : ArrowDownRight
  const nettoTon = n > 0 ? 'plus' : n < 0 ? 'minus' : undefined
  const bereich = gefiltert ? 'Treffer des Filters' : 'alle Buchungen'
  const zaehltMit = 'Anlagen (z. B. Krypto-Käufe) und Forderungen zählen mit. Umbuchungen zwischen eigenen Konten und Anfangsbestände zählen nicht.'

  return (
    <section aria-label="Kennzahlen der Treffer" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel={gefiltert ? 'Treffer' : 'Buchungen'}
          wert={String(summen.anzahl)}
          info={{
            titel: gefiltert ? 'Treffer' : 'Buchungen',
            zeilen: [['Anzahl', String(summen.anzahl)]],
            text: gefiltert
              ? 'Alle Buchungen, die zu den gesetzten Filtern passen — über alle Seiten, nicht nur die angezeigte.'
              : 'Alle Buchungen (manuell und aus der Bank), über alle Seiten.',
          }}
        />
        <Zelle
          titel="Einnahmen"
          wert={euro(summen.einnahmen)}
          ton={summen.einnahmen > 0 ? 'plus' : undefined}
          info={{
            titel: 'Einnahmen',
            zeilen: [['Summe', euro(summen.einnahmen)]],
            text: `Summe der Einnahmen über ${bereich}. ${zaehltMit}`,
          }}
        />
        <Zelle
          titel="Ausgaben"
          wert={euro(summen.ausgaben)}
          ton={summen.ausgaben > 0 ? 'minus' : undefined}
          info={{
            titel: 'Ausgaben',
            zeilen: [['Summe', euro(summen.ausgaben)]],
            text: `Summe der Ausgaben über ${bereich}. ${zaehltMit}`,
          }}
        />
        <Zelle
          titel="Netto"
          wert={euro(Math.abs(n))}
          ton={nettoTon}
          delta={
            <span className={`inline-flex items-center ${nettoTon === 'plus' ? 'text-success' : nettoTon === 'minus' ? 'text-danger' : 'text-muted-foreground'}`}>
              <NettoIcon className="size-3.5" aria-hidden />
              <span className="sr-only">{n > 0 ? 'plus' : n < 0 ? 'minus' : 'ausgeglichen'}</span>
            </span>
          }
          info={{
            titel: 'Netto',
            zeilen: [['Einnahmen', euro(summen.einnahmen)], ['Ausgaben', euro(summen.ausgaben)], ['Netto', `${n > 0 ? '+' : n < 0 ? '−' : ''}${euro(Math.abs(n))}`]],
            text: 'Einnahmen minus Ausgaben der Treffer.',
          }}
        />
        {summen.ohneFluss > 0 && (
          <Zelle
            titel="Nicht gezählt"
            wert={`${summen.ohneFluss}`}
            info={{
              titel: 'Nicht gezählt',
              zeilen: [['Umbuchungen / Anfangsbestände', String(summen.ohneFluss)]],
              text: `${summen.ohneFluss === 1 ? 'Eine Buchung unter den Treffern ist' : `${summen.ohneFluss} Buchungen unter den Treffern sind`} eine Umbuchung zwischen eigenen Konten oder ein Anfangsbestand. Sie bewegen Geld, sind aber weder Einnahme noch Ausgabe und stehen deshalb nicht in den Summen.`,
            }}
          />
        )}
      </div>
      {summen.gekappt && (
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-xs font-medium text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Summe unvollständig (mehr als 20.000 Treffer)
        </p>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
