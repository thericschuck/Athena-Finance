import { Suspense } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { HoverInfo } from '@/components/ui/hover-info'
import { Skeleton } from '@/components/ui/skeleton'
import { ladeTempoDaten } from './AnalyseTempoDaten'
import {
  groessteBuchung, summenAusBuchungen, summenAusMonaten, tageImFenster, tageZwischen, tonFuer,
  veraenderungProzent, veraenderungPunkte,
  type Summen, type Ton,
} from '@/lib/analyse/kennzahlen'
import { vergleichBelastbar, type Fenster } from '@/lib/analyse/vergleich'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'

/**
 * Kachelleiste der Analyse-Seite: Saldo, Einnahmen, Ausgaben, Sparquote, Ø Ausgaben pro Tag,
 * groesste Einzelbuchungen, Anzahl, und die Hochrechnung zum Monatsende.
 *
 * Server-Komponente ohne Zustand. Die Rechenregeln stehen in lib/analyse/kennzahlen.ts (getestet):
 *  - Summen aus den Monatssummen im Fenster `daten.fenster`; bei „Alles" aus ALLEN Einzelbuchungen,
 *    weil die Monatssummen der Seite nur ~24 Monate zurueckreichen.
 *  - „pro Tag": Zaehler und Nenner decken denselben Zeitraum, naemlich ab dem 1. des Cutoff-Monats
 *    bis heute (die Summen gelten ab dort, siehe Kopf von kennzahlen.ts).
 *  - Die Sparquote rechnet nur auf Konsum (flow-calc), auch wenn der Schalter Anlagen einrechnet.
 *  - Vergleich: gleiche Rechnung auf `daten.vergleichsFenster`, nur wenn die Historie es abdeckt.
 *  - Die Kacheln filtern nichts; die Drill-down-Filter der URL (Kategorie, Monat, Tag, Partei)
 *    betreffen nur die Buchungsliste.
 */

type Richtung = 'auf' | 'ab' | 'gleich'

interface DeltaDaten {
  richtung: Richtung
  /** Betrag der Veraenderung ohne Vorzeichen, bereits formatiert (Pfeil und sr-only tragen die Richtung). */
  text: string
  ton: Ton
}

function Delta({ d, wort, sternchen = false }: { d: DeltaDaten | null; wort: string; sternchen?: boolean }) {
  if (!d) return <span className="text-muted-foreground">kein Vergleich möglich</span>
  const Icon = d.richtung === 'auf' ? ArrowUpRight : d.richtung === 'ab' ? ArrowDownRight : Minus
  const farbe = d.ton === 'gut' ? 'text-success' : d.ton === 'schlecht' ? 'text-danger' : 'text-muted-foreground'
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${farbe}`}>
        <Icon className="size-3" aria-hidden />
        <span className="sr-only">{d.richtung === 'auf' ? 'plus' : d.richtung === 'ab' ? 'minus' : 'unverändert'}</span>
        {d.text}
      </span>
      <span className="text-muted-foreground">{wort}{sternchen ? '*' : ''}</span>
    </span>
  )
}

/** Position der Erklaerungskarte: in der rechten Spalte rechtsbuendig, damit sie nicht ueber den Rand ragt. */
type Seite = 'l' | 'r'
const popKlasse = (mobil: Seite, md: Seite) =>
  `${mobil === 'r' ? 'right-0' : 'left-0'} ${md === 'r' ? 'md:left-auto md:right-0' : 'md:left-0 md:right-auto'}`

function Kachel({
  titel, wert, unter, ton, gross = false, span = '', info, mobil = 'l', md = 'l',
}: {
  titel: string
  wert: string
  unter?: React.ReactNode
  ton?: 'success' | 'danger'
  gross?: boolean
  span?: string
  info: { titel: string; zeilen?: [string, string][]; text: string }
  mobil?: Seite
  md?: Seite
}) {
  return (
    <HoverInfo
      bare
      titel={info.titel}
      zeilen={info.zeilen}
      text={info.text}
      className={`flex w-full min-w-0 items-stretch text-left ${span}`}
      popClassName={popKlasse(mobil, md)}
    >
      <div className="w-full min-w-0 rounded-lg border border-border bg-card px-4 py-3">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="truncate">{titel}</span>
          <Info className="size-3 shrink-0 opacity-60" aria-hidden />
        </p>
        <p className={`mt-1 truncate font-semibold tabular-nums tracking-tight ${gross ? 'text-3xl sm:text-2xl' : 'text-xl'} ${
          ton === 'success' ? 'text-success' : ton === 'danger' ? 'text-danger' : ''
        }`}>
          {wert}
        </p>
        {unter && <div className="mt-0.5 min-h-4 text-[11px] leading-snug text-muted-foreground">{unter}</div>}
      </div>
    </HoverInfo>
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
  const vergleichWort = daten.vergleich === 'vorjahr' ? 'zum Vorjahr' : 'zur Vorperiode'
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

  // Groesste Einzelbuchungen: aus den Buchungen im Zeitraum (ab dem Cutoff-Tag, wie die Buchungsliste).
  const groessteAusgabe = groessteBuchung(daten.txns, 'expense')
  const groessteEinnahme = groessteBuchung(daten.txns, 'income')
  const einzel = (t: typeof groessteAusgabe) =>
    t ? (
      <span className="block truncate" title={`${t.merchant || t.description || t.category_name || 'Buchung'} · ${fmtDate(t.date, daten.dateFormat)}`}>
        {t.merchant || t.description || t.category_name || 'Buchung'} · {fmtDate(t.date, daten.dateFormat)}
      </span>
    ) : 'keine im Zeitraum'

  const hatDaten = jetzt.anzahl > 0 || jetzt.einnahmen > 0 || jetzt.ausgaben > 0
  const zeitraum = fensterText(daten.fenster)
  const sicht = include.anlage || include.forderung
    ? 'Anlagen und Forderungen zählen mit, solange der Schalter an ist.'
    : 'Anlagen und Forderungen sind ausgeblendet.'

  const vorZeile = (label: string, wert: string): [string, string][] => (vor ? [[label, wert]] : [])
  const wortSterne = (d: DeltaDaten | null) => <Delta d={d} wort={vergleichWort} sternchen={vor !== null} />

  return (
    <section aria-label="Kennzahlen" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kachel
          titel="Saldo"
          gross
          span="col-span-2"
          wert={hatDaten ? `${vorzeichen(jetzt.netto)}${euro(Math.abs(jetzt.netto))}` : '—'}
          ton={!hatDaten || Math.round(jetzt.netto) === 0 ? undefined : jetzt.netto > 0 ? 'success' : 'danger'}
          unter={
            <span className="flex flex-wrap items-center gap-x-2">
              <span>Einnahmen − Ausgaben · {zeitraum}</span>
              {vor && wortSterne(differenzEuro(jetzt.netto, vor.netto))}
            </span>
          }
          info={{
            titel: 'Saldo im Zeitraum',
            zeilen: [['Zeitraum', zeitraum], ...vorZeile(vergleichName, `${vorzeichen(vor?.netto ?? 0)}${euro(Math.abs(vor?.netto ?? 0))}`)],
            text: `Einnahmen minus Ausgaben im gewählten Zeitraum, nicht der Kontostand. ${sicht} Umbuchungen zwischen eigenen Konten fehlen.`,
          }}
        />
        <Kachel
          titel="Einnahmen"
          wert={hatDaten ? euro(jetzt.einnahmen) : '—'}
          unter={vor ? wortSterne(prozent(jetzt.einnahmen, vor.einnahmen, true)) : undefined}
          mobil="l" md="r"
          info={{
            titel: 'Einnahmen',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(jetzt.einnahmen, 2)], ...vorZeile(vergleichName, euro(vor?.einnahmen ?? 0, 2))],
            text: `Alles, was im Zeitraum hereingekommen ist. ${sicht}`,
          }}
        />
        <Kachel
          titel="Ausgaben"
          wert={hatDaten ? euro(jetzt.ausgaben) : '—'}
          unter={vor ? wortSterne(prozent(jetzt.ausgaben, vor.ausgaben, false)) : undefined}
          mobil="r" md="r"
          info={{
            titel: 'Ausgaben',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(jetzt.ausgaben, 2)], ...vorZeile(vergleichName, euro(vor?.ausgaben ?? 0, 2))],
            text: `Alles, was im Zeitraum abgeflossen ist. Ein Anstieg gegenüber dem Vergleich ist rot, ein Rückgang grün. ${sicht}`,
          }}
        />
        <Kachel
          titel="Sparquote"
          wert={jetzt.sparquote === null ? '—' : `${jetzt.sparquote.toLocaleString(locale)} %`}
          ton={jetzt.sparquote === null ? undefined : jetzt.sparquote >= 0 ? 'success' : 'danger'}
          unter={
            vor
              ? <Delta d={punkte(jetzt.sparquote, vor.sparquote)} wort={vergleichWort} />
              : jetzt.sparquote === null ? 'keine Einnahmen' : 'nur Konsum'
          }
          mobil="l" md="l"
          info={{
            titel: 'Sparquote',
            zeilen: vor ? [[vergleichName, vor.sparquote === null ? '—' : `${vor.sparquote} %`]] : [],
            text: 'Anteil der Einnahmen, der nach den Konsumausgaben übrig bleibt. Geld, das in Anlagen fließt, zählt als Sparen und nicht als Ausgabe, auch wenn der Schalter Anlagen einrechnet. Die Veränderung steht in Prozentpunkten.',
          }}
        />
        <Kachel
          titel="Ø Ausgaben / Tag"
          wert={jetzt.ausgabenProTag === null || !hatDaten ? '—' : euro(jetzt.ausgabenProTag)}
          unter={
            vor && vor.ausgabenProTag !== null && jetzt.ausgabenProTag !== null
              ? <Delta d={prozent(jetzt.ausgabenProTag, vor.ausgabenProTag, false)} wort={vergleichWort} />
              : jetzt.tage > 0 ? `über ${jetzt.tage.toLocaleString(locale)} ${jetzt.tage === 1 ? 'Tag' : 'Tage'}` : undefined
          }
          mobil="r" md="l"
          info={{
            titel: 'Ø Ausgaben pro Tag',
            zeilen: [
              ['Tage', jetzt.tage.toLocaleString(locale)],
              ...(vor?.ausgabenProTag != null ? [[vergleichName, euro(vor.ausgabenProTag)] as [string, string]] : []),
            ],
            text: 'Ausgaben geteilt durch die Tage vom Monatsersten des Zeitraums bis heute. Weil beide Seiten gleich lang sind, ist der Vergleich auch im laufenden Monat fair.',
          }}
        />
        <Kachel
          titel="Größte Ausgabe"
          wert={groessteAusgabe ? euro(groessteAusgabe.amount) : '—'}
          unter={einzel(groessteAusgabe)}
          mobil="l" md="r"
          info={{
            titel: 'Größte Einzelausgabe',
            text: 'Die einzelne Ausgabe mit dem höchsten Betrag im Zeitraum. Es werden nur Buchungen ab dem Starttag gezählt, genau wie in der Buchungsliste unten.',
          }}
        />
        <Kachel
          titel="Größte Einnahme"
          wert={groessteEinnahme ? euro(groessteEinnahme.amount) : '—'}
          unter={einzel(groessteEinnahme)}
          mobil="r" md="r"
          info={{
            titel: 'Größte Einzeleinnahme',
            text: 'Die einzelne Einnahme mit dem höchsten Betrag im Zeitraum, ab dem Starttag, wie in der Buchungsliste unten.',
          }}
        />
        <Kachel
          titel="Buchungen"
          span="col-span-2 md:col-span-1"
          wert={jetzt.anzahl.toLocaleString(locale)}
          unter="ohne Umbuchungen"
          info={{
            titel: 'Anzahl Buchungen',
            zeilen: vor ? [[vergleichName, vor.anzahl.toLocaleString(locale)]] : [],
            text: 'Alle Einnahmen- und Ausgabenbuchungen im Zeitraum, die in die Summen eingehen. Umbuchungen zwischen eigenen Konten sind nicht dabei.',
          }}
        />
        <Suspense fallback={<Skeleton className="col-span-2 h-28 rounded-lg md:col-span-3" />}>
          <Hochrechnung daten={daten} />
        </Suspense>
      </div>

      {vor && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          * Der laufende Monat ist noch nicht voll: Einnahmen, Ausgaben und Saldo liegen gegen die abgeschlossene
          Vergleichsperiode daher zu niedrig. Ø pro Tag und Sparquote sind davon kaum betroffen.
        </p>
      )}
    </section>
  )
}

/**
 * Hochrechnung zum Monatsende. Eigene Komponente hinter <Suspense>, weil sie die Buchungen der
 * Vormonate nachlaedt (ladeTempoDaten, dieselbe Abfrage wie AnalyseTempo) und die uebrigen
 * Kacheln nicht darauf warten sollen. Gilt immer fuer den laufenden Monat, unabhaengig vom
 * gewaehlten Zeitraum.
 */
async function Hochrechnung({ daten }: AnalyseAbschnittProps) {
  const t = await ladeTempoDaten(daten)
  if (!t) return null
  const { locale } = daten
  // Auf 10 € gerundet: eine Schaetzung soll nicht auf den Euro genau aussehen.
  const grob = (n: number) => fmtCurrency(Math.round(n / 10) * 10, 'EUR', locale, { fractionDigits: 0 })
  const euro = (n: number, d = 2) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const tag = Number(daten.heute.slice(8, 10))
  const linear = t.hochrechnungAusgaben.methode === 'linear'

  const spalte = (titel: string, h: typeof t.hochrechnungAusgaben) => (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{titel}</p>
      <p className="truncate text-xl font-semibold tabular-nums tracking-tight">≈ {grob(h.mitte)}</p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {h.unten !== null && h.oben !== null
          ? `typisch ${grob(h.unten)} bis ${grob(h.oben)}`
          : 'grobe Schätzung'}
        {' · '}bisher {euro(h.stand, 0)}
      </p>
    </div>
  )

  return (
    <HoverInfo
      bare
      titel="Hochrechnung Monatsende"
      zeilen={[
        ['Stand', `Tag ${tag}`],
        ['Grundlage', linear ? 'linear nach Tagen' : `${t.hochrechnungAusgaben.monate} Vormonate`],
      ]}
      text={linear
        ? 'Zu wenig abgeschlossene Monate für einen Erfahrungswert: der Stand wird einfach nach Tagen auf den Monat hochgerechnet. Das ist nur eine grobe Schätzung.'
        : 'Heutiger Stand plus das, was in den Vormonaten nach dem gleichen Tag noch dazukam. So werden Fixkosten vom Monatsanfang nicht mit hochgerechnet. „Typisch" ist die mittlere Hälfte dieser Schätzungen.'}
      className="col-span-2 flex w-full min-w-0 items-stretch text-left md:col-span-3"
      popClassName="left-0"
    >
      <div className="w-full min-w-0 rounded-lg border border-border bg-card px-4 py-3">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="truncate">Hochrechnung Monatsende</span>
          <Info className="size-3 shrink-0 opacity-60" aria-hidden />
        </p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          {spalte('Ausgaben', t.hochrechnungAusgaben)}
          {spalte('Einnahmen', t.hochrechnungEinnahmen)}
        </div>
        {linear && (
          <p className="mt-1 text-[11px] text-muted-foreground">Zu wenig Historie: linear nach Tagen geschätzt.</p>
        )}
      </div>
    </HoverInfo>
  )
}
