import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { formatBetrag, formatMitVorzeichen } from './format'

/**
 * Schmale Kennzahlenleiste der Konto-Detailseite: Kontostand, Einnahmen, Ausgaben, Netto im
 * Zeitraum. Eine Karte mit dünnen Trennlinien (Raster mit 1 px Lücke über dem Rahmen-Hintergrund);
 * mobil 2 x 2, ab sm vier nebeneinander. Erklärungen kommen aus AnalyseKennzahlInfo (Portal-Karte).
 *
 * Server-Komponente ohne Zustand.
 */

const ZELLE =
  'flex h-16 min-w-0 cursor-help flex-col justify-center overflow-hidden bg-card px-4 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, ton, info,
}: {
  titel: string
  wert: string
  ton?: 'success' | 'danger'
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className={`mt-0.5 truncate text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
        ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''
      }`}>
        {wert}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export interface KontoKennzahlenProps {
  kontostand: number
  /** Woher der Kontostand stammt — steht in der Hover-Karte. */
  quelle: 'bank' | 'snapshot' | 'buchungen'
  einnahmen: number
  ausgaben: number
  netto: number
  anzahl: number
  /** Beschriftung des gewählten Zeitraums („1J“, „Alles“ …) bzw. Monats. */
  zeitraum: string
  currency: string
  locale: string
}

const QUELLE_TEXT: Record<KontoKennzahlenProps['quelle'], string> = {
  bank: 'Der von der Bank gemeldete Saldo (letzter Abruf).',
  snapshot: 'Der letzte bekannte Saldo aus dem täglichen Verlauf.',
  buchungen: 'Noch kein Saldo bekannt: die Summe aller Buchungen auf diesem Konto.',
}

export function KontoKennzahlen(p: KontoKennzahlenProps) {
  const { currency, locale } = p
  const betrag = (n: number) => formatBetrag(n, currency, locale)

  return (
    <section
      aria-label="Kennzahlen"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4"
    >
      <Zelle
        titel="Kontostand"
        wert={betrag(p.kontostand)}
        ton={p.kontostand < 0 ? 'danger' : undefined}
        info={{
          titel: 'Kontostand',
          text: `${QUELLE_TEXT[p.quelle]} Er hängt nicht am Zeitraum: Einnahmen minus Ausgaben im Zeitraum wären nur die Bewegung, nicht das, was auf dem Konto liegt.`,
        }}
      />
      <Zelle
        titel="Einnahmen"
        wert={`+${betrag(p.einnahmen)}`}
        ton="success"
        info={{
          titel: 'Einnahmen',
          zeilen: [['Zeitraum', p.zeitraum]],
          text: 'Alles, was im Zeitraum hereingekommen ist. Umbuchungen zwischen eigenen Konten und Anfangsbestände zählen nicht mit; Anlagen und Forderungen schon.',
        }}
      />
      <Zelle
        titel="Ausgaben"
        wert={`−${betrag(p.ausgaben)}`}
        ton="danger"
        info={{
          titel: 'Ausgaben',
          zeilen: [['Zeitraum', p.zeitraum]],
          text: 'Alles, was im Zeitraum abgeflossen ist. Umbuchungen zwischen eigenen Konten und Anfangsbestände zählen nicht mit; Anlagen und Forderungen schon.',
        }}
      />
      <Zelle
        titel="Netto"
        wert={formatMitVorzeichen(p.netto, currency, locale)}
        ton={p.netto > 0 ? 'success' : p.netto < 0 ? 'danger' : undefined}
        info={{
          titel: 'Netto im Zeitraum',
          zeilen: [['Zeitraum', p.zeitraum], ['Buchungen', p.anzahl.toLocaleString(locale)]],
          text: 'Einnahmen minus Ausgaben im gewählten Zeitraum, nach denselben Regeln wie Dashboard und Analyse.',
        }}
      />
    </section>
  )
}
