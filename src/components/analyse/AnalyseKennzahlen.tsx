import { Suspense } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyseKennzahlInfo } from './AnalyseKennzahlInfo'
import { ladeTempoDaten } from './AnalyseTempoDaten'
import {
  groessteBuchung, summenAusBuchungen, summenAusMonaten, tageImFenster, tageZwischen, tonFuer,
  veraenderungProzent, veraenderungPunkte,
  type Summen, type Ton,
} from '@/lib/analyse/kennzahlen'
import { vergleichBelastbar, type Fenster } from '@/lib/analyse/vergleich'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'

/**
 * Schmale, einzeilige Kennzahlen-Leiste der Analyse-Seite: Saldo, Einnahmen, Ausgaben, Sparquote,
 * Ø Ausgaben pro Tag, groesste Ausgabe, Hochrechnung Monatsende, Anzahl.
 *
 * Eine Karte mit duennen Trennlinien statt einer Kachel je Kennzahl, damit die Seite kuerzer wird.
 * Auf dem Desktop passen alle nebeneinander; sonst scrollt die Leiste waagerecht (Scroll-Snap,
 * versteckte Scrollbar, Fades an den Raendern). Erklaerungen kommen aus AnalyseKennzahlInfo (Portal,
 * weil ein scrollbarer Container absolut positionierte Karten abschneiden wuerde).
 *
 * Server-Komponente ohne Zustand. Die Rechenregeln stehen unveraendert in lib/analyse/kennzahlen.ts:
 *  - Summen aus den Monatssummen im Fenster `daten.fenster`; bei „Alles" aus ALLEN Einzelbuchungen,
 *    weil die Monatssummen der Seite nur ~24 Monate zurueckreichen.
 *  - „pro Tag": Zaehler und Nenner decken denselben Zeitraum, naemlich ab dem 1. des Cutoff-Monats
 *    bis heute (die Summen gelten ab dort, siehe Kopf von kennzahlen.ts).
 *  - Die Sparquote rechnet nur auf Konsum (flow-calc), auch wenn der Schalter Anlagen einrechnet.
 *  - Vergleich: gleiche Rechnung auf `daten.vergleichsFenster`, nur wenn die Historie es abdeckt.
 *  - Die Zellen filtern nichts; die Drill-down-Filter der URL betreffen nur die Buchungsliste.
 *  - Der laufende Monat im Vergleich ist nur ein „*" an der Zahl; die Erklaerung steht in der Karte.
 */

type Richtung = 'auf' | 'ab' | 'gleich'

interface DeltaDaten {
  richtung: Richtung
  /** Veraenderung inkl. Vorzeichen, bereits formatiert. */
  text: string
  ton: Ton
}

/** Pfeil + Zahl (Farbe ist nie das einzige Signal); `sternchen` markiert den unvollen Monat. */
function Delta({ d, sternchen = false }: { d: DeltaDaten | null; sternchen?: boolean }) {
  if (!d) return null
  const Icon = d.richtung === 'auf' ? ArrowUpRight : d.richtung === 'ab' ? ArrowDownRight : Minus
  const farbe = d.ton === 'gut' ? 'text-success' : d.ton === 'schlecht' ? 'text-danger' : 'text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${farbe}`}>
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{d.richtung === 'auf' ? 'plus' : d.richtung === 'ab' ? 'minus' : 'unverändert'}</span>
      {d.text}{sternchen ? '*' : ''}
    </span>
  )
}

const ZELLE = 'flex h-16 shrink-0 snap-start cursor-help flex-col justify-center whitespace-nowrap border-l border-border px-4 first:border-l-0 outline-none focus-visible:bg-accent/40'

function Zelle({
  titel, wert, delta, ton, info,
}: {
  titel: string
  wert: string
  delta?: React.ReactNode
  ton?: 'success' | 'danger'
  info: { titel: string; zeilen?: [string, string][]; text: string }
}) {
  return (
    <AnalyseKennzahlInfo className={ZELLE} titel={info.titel} zeilen={info.zeilen} text={info.text}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-base font-semibold tabular-nums tracking-tight sm:text-lg ${
          ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''
        }`}>
          {wert}
        </span>
        {delta}
      </span>
    </AnalyseKennzahlInfo>
  )
}

export function AnalyseKennzahlen({ daten }: AnalyseAbschnittProps) {
  const { locale, include } = daten
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const vorzeichen = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')
  const monatKurz = (f: string) =>
    new Date(`${f.slice(0, 7)}-15T12:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' })
  const fensterText = (f: Fenster | null) =>
    f ? (f.von === f.bis ? monatKurz(f.von) : `${monatKurz(f.von)} – ${monatKurz(f.bis)}`) : 'gesamte Historie'

  // Aktueller Zeitraum.
  const jetzt: Summen = daten.fenster
    ? summenAusMonaten(daten.monatsZeilen, include, daten.fenster, tageZwischen(daten.fenster.von, daten.heute))
    : summenAusBuchungen(daten.txns, include, daten.heute)

  // Vergleich nur, wenn es ein Fenster gibt UND die Historie es abdeckt.
  const vf = daten.vergleichsFenster && vergleichBelastbar(daten.vergleichsFenster, daten.fruehesterMonat)
    ? daten.vergleichsFenster : null
  const vor: Summen | null = vf ? summenAusMonaten(daten.monatsZeilen, include, vf, tageImFenster(vf)) : null
  const vergleichName = daten.vergleich === 'vorjahr' ? 'Vorjahr' : 'Vorperiode'

  const prozent = (akt: number, vorher: number, steigtIstGut: boolean): DeltaDaten | null => {
    const p = veraenderungProzent(akt, vorher)
    if (p === null) return null
    const r = Math.round(p)
    return {
      richtung: r > 0 ? 'auf' : r < 0 ? 'ab' : 'gleich',
      text: `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString(locale)} %`,
      ton: tonFuer(p, steigtIstGut),
    }
  }
  const differenzEuro = (akt: number, vorher: number): DeltaDaten => {
    const d = akt - vorher
    const r = Math.round(d)
    return {
      richtung: r > 0 ? 'auf' : r < 0 ? 'ab' : 'gleich',
      text: `${vorzeichen(r)}${euro(Math.abs(r))}`,
      ton: tonFuer(d, true),
    }
  }
  const punkte = (akt: number | null, vorher: number | null): DeltaDaten | null => {
    const d = veraenderungPunkte(akt, vorher)
    if (d === null) return null
    const r = Math.round(d)
    return {
      richtung: r > 0 ? 'auf' : r < 0 ? 'ab' : 'gleich',
      text: `${vorzeichen(r)}${Math.abs(r).toLocaleString(locale)} Pkt.`,
      ton: tonFuer(d, true),
    }
  }

  // Groesste Einzelausgabe: aus den Buchungen im Zeitraum (ab dem Cutoff-Tag, wie die Buchungsliste).
  const groessteAusgabe = groessteBuchung(daten.txns, 'expense')
  const nameDerBuchung = groessteAusgabe
    ? groessteAusgabe.merchant || groessteAusgabe.description || groessteAusgabe.category_name || 'Buchung'
    : null

  const hatDaten = jetzt.anzahl > 0 || jetzt.einnahmen > 0 || jetzt.ausgaben > 0
  const zeitraum = fensterText(daten.fenster)
  const sicht = include.anlage || include.forderung
    ? 'Anlagen und Forderungen zählen mit, solange der Schalter an ist.'
    : 'Anlagen und Forderungen sind ausgeblendet.'
  // Das „*" an den Veraenderungen: der laufende Monat ist noch nicht voll.
  const sterneText = vor
    ? ` * Der laufende Monat ist noch nicht voll: gegen die abgeschlossene ${vergleichName} liegt die Veränderung daher zu niedrig.`
    : ''
  const vorZeile = (wert: string): [string, string][] => (vor ? [[vergleichName, wert]] : [])
  const stern = vor !== null

  return (
    <section aria-label="Kennzahlen" className="relative rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel="Saldo"
          wert={hatDaten ? `${vorzeichen(jetzt.netto)}${euro(Math.abs(jetzt.netto))}` : '—'}
          ton={!hatDaten || Math.round(jetzt.netto) === 0 ? undefined : jetzt.netto > 0 ? 'success' : 'danger'}
          delta={vor ? <Delta d={differenzEuro(jetzt.netto, vor.netto)} sternchen={stern} /> : undefined}
          info={{
            titel: 'Saldo im Zeitraum',
            zeilen: [['Zeitraum', zeitraum], ...vorZeile(`${vorzeichen(vor?.netto ?? 0)}${euro(Math.abs(vor?.netto ?? 0))}`)],
            text: `Einnahmen minus Ausgaben im gewählten Zeitraum, nicht der Kontostand. ${sicht} Umbuchungen zwischen eigenen Konten fehlen.${sterneText}`,
          }}
        />
        <Zelle
          titel="Einnahmen"
          wert={hatDaten ? euro(jetzt.einnahmen) : '—'}
          delta={vor ? <Delta d={prozent(jetzt.einnahmen, vor.einnahmen, true)} sternchen={stern} /> : undefined}
          info={{
            titel: 'Einnahmen',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(jetzt.einnahmen, 2)], ...vorZeile(euro(vor?.einnahmen ?? 0, 2))],
            text: `Alles, was im Zeitraum hereingekommen ist. ${sicht}${sterneText}`,
          }}
        />
        <Zelle
          titel="Ausgaben"
          wert={hatDaten ? euro(jetzt.ausgaben) : '—'}
          delta={vor ? <Delta d={prozent(jetzt.ausgaben, vor.ausgaben, false)} sternchen={stern} /> : undefined}
          info={{
            titel: 'Ausgaben',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(jetzt.ausgaben, 2)], ...vorZeile(euro(vor?.ausgaben ?? 0, 2))],
            text: `Alles, was im Zeitraum abgeflossen ist. Ein Anstieg gegenüber dem Vergleich ist rot, ein Rückgang grün. ${sicht}${sterneText}`,
          }}
        />
        <Zelle
          titel="Sparquote"
          wert={jetzt.sparquote === null ? '—' : `${jetzt.sparquote.toLocaleString(locale)} %`}
          ton={jetzt.sparquote === null ? undefined : jetzt.sparquote >= 0 ? 'success' : 'danger'}
          delta={vor ? <Delta d={punkte(jetzt.sparquote, vor.sparquote)} /> : undefined}
          info={{
            titel: 'Sparquote',
            zeilen: [
              ...(jetzt.sparquote === null ? [['Hinweis', 'keine Einnahmen'] as [string, string]] : []),
              ...vorZeile(vor?.sparquote == null ? '—' : `${vor.sparquote} %`),
            ],
            text: 'Anteil der Einnahmen, der nach den Konsumausgaben übrig bleibt. Geld, das in Anlagen fließt, zählt als Sparen und nicht als Ausgabe, auch wenn der Schalter Anlagen einrechnet. Die Veränderung steht in Prozentpunkten.',
          }}
        />
        <Zelle
          titel="Ø Ausgaben / Tag"
          wert={jetzt.ausgabenProTag === null || !hatDaten ? '—' : euro(jetzt.ausgabenProTag)}
          delta={
            vor && vor.ausgabenProTag !== null && jetzt.ausgabenProTag !== null
              ? <Delta d={prozent(jetzt.ausgabenProTag, vor.ausgabenProTag, false)} />
              : undefined
          }
          info={{
            titel: 'Ø Ausgaben pro Tag',
            zeilen: [
              ['Tage', jetzt.tage.toLocaleString(locale)],
              ...(vor?.ausgabenProTag != null ? [[vergleichName, euro(vor.ausgabenProTag)] as [string, string]] : []),
            ],
            text: 'Ausgaben geteilt durch die Tage vom Monatsersten des Zeitraums bis heute. Weil beide Seiten gleich lang sind, ist der Vergleich auch im laufenden Monat fair.',
          }}
        />
        <Zelle
          titel="Größte Ausgabe"
          wert={groessteAusgabe ? euro(groessteAusgabe.amount) : '—'}
          info={{
            titel: 'Größte Einzelausgabe',
            zeilen: groessteAusgabe && nameDerBuchung
              ? [['Buchung', nameDerBuchung.length > 28 ? `${nameDerBuchung.slice(0, 27)} …` : nameDerBuchung], ['Datum', fmtDate(groessteAusgabe.date, daten.dateFormat)]]
              : [],
            text: 'Die einzelne Ausgabe mit dem höchsten Betrag im Zeitraum. Es werden nur Buchungen ab dem Starttag gezählt, genau wie in der Buchungsliste unten.',
          }}
        />
        <Suspense fallback={<div className="flex h-16 w-40 shrink-0 items-center border-l border-border px-4"><Skeleton className="h-8 w-28" /></div>}>
          <Hochrechnung daten={daten} />
        </Suspense>
        <Zelle
          titel="Buchungen"
          wert={jetzt.anzahl.toLocaleString(locale)}
          info={{
            titel: 'Anzahl Buchungen',
            zeilen: vorZeile(vor?.anzahl.toLocaleString(locale) ?? ''),
            text: 'Alle Einnahmen- und Ausgabenbuchungen im Zeitraum, die in die Summen eingehen. Umbuchungen zwischen eigenen Konten sind nicht dabei.',
          }}
        />
      </div>
      {/* Fades zeigen am Handy, dass die Leiste weiterscrollt; am Desktop passt alles. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}

/**
 * Hochrechnung zum Monatsende (Ausgaben in der Zelle, Einnahmen in der Karte). Eigene Komponente
 * hinter <Suspense>, weil sie die Buchungen der Vormonate nachlaedt (ladeTempoDaten, dieselbe
 * Abfrage wie AnalyseTempo) und die uebrigen Zellen nicht darauf warten sollen. Gilt immer fuer den
 * laufenden Monat, unabhaengig vom gewaehlten Zeitraum.
 */
async function Hochrechnung({ daten }: AnalyseAbschnittProps) {
  const t = await ladeTempoDaten(daten)
  if (!t) return null
  const { locale } = daten
  // Auf 10 € gerundet: eine Schaetzung soll nicht auf den Euro genau aussehen.
  const grob = (n: number) => fmtCurrency(Math.round(n / 10) * 10, 'EUR', locale, { fractionDigits: 0 })
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const tag = Number(daten.heute.slice(8, 10))
  const a = t.hochrechnungAusgaben
  const e = t.hochrechnungEinnahmen
  const linear = a.methode === 'linear'
  const spanne = (h: typeof a) => (h.unten !== null && h.oben !== null ? `${grob(h.unten)} bis ${grob(h.oben)}` : 'grobe Schätzung')

  return (
    <Zelle
      titel="Hochrechnung Monatsende"
      wert={`≈ ${grob(a.mitte)}`}
      delta={<span className="text-[11px] text-muted-foreground">Ausg.</span>}
      info={{
        titel: 'Hochrechnung Monatsende',
        zeilen: [
          ['Ausgaben', `≈ ${grob(a.mitte)}`],
          [linear ? 'Schätzung' : 'typisch', spanne(a)],
          ['Einnahmen', `≈ ${grob(e.mitte)}`],
          [linear ? 'Schätzung' : 'typisch', spanne(e)],
          [`Stand Tag ${tag}`, `${euro(a.stand)} / ${euro(e.stand)}`],
        ],
        text: linear
          ? 'Zu wenig abgeschlossene Monate für einen Erfahrungswert: der Stand wird einfach nach Tagen auf den Monat hochgerechnet. Das ist nur eine grobe Schätzung. Gilt immer für den laufenden Monat.'
          : `Heutiger Stand plus das, was in den ${a.monate} Vormonaten nach dem gleichen Tag noch dazukam, so werden Fixkosten vom Monatsanfang nicht mit hochgerechnet. „Typisch" ist die mittlere Hälfte dieser Schätzungen. Gilt immer für den laufenden Monat.`,
      }}
    />
  )
}
