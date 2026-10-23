import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import { berechneKennzahlen, parteiName, veraenderungProzent } from '@/lib/bank/auswertung'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Schmale, einzeilige Kennzahlen-Leiste der Bankdaten-Seite — dasselbe Muster wie
 * AnalyseKennzahlen: eine Karte mit duennen Trennlinien statt einer Kachel je Kennzahl, damit die
 * Seite kuerzer wird. Ab lg passt alles nebeneinander; darunter scrollt NUR die Leiste waagerecht
 * (Scroll-Snap, versteckte Scrollbar, Fades). `min-w-0`/`max-w-full` am Abschnitt sorgen dafuer,
 * dass die Leiste die Seite nie breiter macht. Erklaerungen kommen per Portal aus
 * AnalyseKennzahlInfo (unveraendert wiederverwendet).
 *
 * Server-Komponente ohne Zustand; die Rechnung steht unveraendert in lib/bank/auswertung.ts
 * (Flows fuer Einnahmen/Ausgaben/Sparquote, Rohbuchungen ohne Umbuchungen fuer groesste Ausgabe
 * und Anzahl). Das „*" an der Veraenderung markiert den laufenden, noch unvollen Monat.
 */

type Ton = 'gut' | 'schlecht' | 'neutral'
interface DeltaDaten { richtung: 'auf' | 'ab' | 'gleich'; text: string; ton: Ton }

/** Pfeil + Zahl (Farbe ist nie das einzige Signal). */
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

function Zelle({ titel, wert, delta, ton, info }: {
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

export function BankKennzahlen({ daten, scope }: BankAbschnittProps) {
  const k = berechneKennzahlen(daten, scope)
  const locale = daten.locale
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const vor = k.vorperiode
  const hatFlows = scope.flows.length > 0

  const prozent = (akt: number, vorher: number, steigtIstGut: boolean): DeltaDaten | null => {
    const p = veraenderungProzent(akt, vorher)
    if (p === null) return null
    const r = Math.round(p)
    return {
      richtung: r > 0 ? 'auf' : r < 0 ? 'ab' : 'gleich',
      text: `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString(locale)} %`,
      ton: r === 0 ? 'neutral' : (r > 0) === steigtIstGut ? 'gut' : 'schlecht',
    }
  }

  const sicht = daten.include.anlage || daten.include.forderung
    ? 'Anlagen und Forderungen zählen mit, solange der Schalter an ist.'
    : 'Anlagen und Forderungen sind ausgeblendet.'
  const sterneText = vor?.laufenderMonat
    ? ' * Der laufende Monat ist noch nicht voll: gegen die abgeschlossene Vorperiode liegt die Veränderung daher zu niedrig.'
    : ''
  const stern = vor?.laufenderMonat ?? false
  const vorZeile = (wert: string): [string, string][] => (vor ? [['Vorperiode', wert]] : [])
  const zeitraum = daten.monat ?? daten.periode
  const g = k.groessteAusgabe
  const gName = g ? parteiName(g) : null

  return (
    <section aria-label="Kennzahlen" className="relative min-w-0 max-w-full rounded-lg border border-border bg-card">
      <div className="flex snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Zelle
          titel={daten.konto ? 'Saldo Konto' : 'Gesamtsaldo'}
          wert={k.saldo === null ? '—' : euro(k.saldo)}
          info={{
            titel: daten.konto ? 'Saldo des gewählten Kontos' : 'Gesamtsaldo',
            zeilen: [['Konten', String(daten.konto ? 1 : daten.balances.length)]],
            text: 'Letzter gebuchter Kontostand, nicht die Differenz im Zeitraum. Er hängt nicht vom Zeitraum ab.',
          }}
        />
        <Zelle
          titel="Einnahmen"
          wert={hatFlows ? euro(k.einnahmen) : '—'}
          delta={vor ? <Delta d={prozent(k.einnahmen, vor.einnahmen, true)} sternchen={stern} /> : undefined}
          info={{
            titel: 'Einnahmen',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(k.einnahmen, 2)], ...vorZeile(euro(vor?.einnahmen ?? 0, 2))],
            text: `Alles, was im Zeitraum hereingekommen ist, ohne Umbuchungen zwischen eigenen Konten. ${sicht}${sterneText}`,
          }}
        />
        <Zelle
          titel="Ausgaben"
          wert={hatFlows ? euro(k.ausgaben) : '—'}
          delta={vor ? <Delta d={prozent(k.ausgaben, vor.ausgaben, false)} sternchen={stern} /> : undefined}
          info={{
            titel: 'Ausgaben',
            zeilen: [['Zeitraum', zeitraum], ['Summe', euro(k.ausgaben, 2)], ['Saldo', `${k.netto > 0 ? '+' : k.netto < 0 ? '−' : ''}${euro(Math.abs(k.netto), 2)}`], ...vorZeile(euro(vor?.ausgaben ?? 0, 2))],
            text: `Alles, was im Zeitraum abgeflossen ist. Ein Anstieg gegenüber der Vorperiode ist rot, ein Rückgang grün. ${sicht}${sterneText}`,
          }}
        />
        <Zelle
          titel="Sparquote"
          wert={k.sparquote === null ? '—' : `${k.sparquote.toLocaleString(locale)} %`}
          ton={k.sparquote === null ? undefined : k.sparquote >= 0 ? 'success' : 'danger'}
          info={{
            titel: 'Sparquote',
            zeilen: k.sparquote === null ? [['Hinweis', 'keine Einnahmen']] : [],
            text: 'Anteil der Einnahmen, der nach den Konsumausgaben übrig bleibt. Geld, das in Anlagen fließt, zählt als Sparen und nicht als Ausgabe, auch wenn der Schalter Anlagen einrechnet.',
          }}
        />
        <Zelle
          titel="Ø Ausgaben / Tag"
          wert={k.ausgabenProTag === null || !hatFlows ? '—' : euro(k.ausgabenProTag)}
          info={{
            titel: 'Ø Ausgaben pro Tag',
            zeilen: [['Tage', k.tage.toLocaleString(locale)]],
            text: 'Ausgaben geteilt durch die Tage des Zeitraums bis heute (bei einem gewählten, abgeschlossenen Monat dessen Länge).',
          }}
        />
        <Zelle
          titel="Größte Ausgabe"
          wert={g ? euro(-g.amount) : '—'}
          info={{
            titel: 'Größte Einzelausgabe',
            zeilen: g && gName
              ? [['Buchung', gName.length > 28 ? `${gName.slice(0, 27)} …` : gName], ['Datum', fmtDate(g.value_date, daten.dateFormat)]]
              : [],
            text: 'Die einzelne Ausgabe mit dem höchsten Betrag im Zeitraum, ohne Umbuchungen.',
          }}
        />
        <Zelle
          titel="Buchungen"
          wert={k.anzahl.toLocaleString(locale)}
          info={{
            titel: 'Anzahl Buchungen',
            zeilen: k.groessteEinnahme ? [['Größte Einnahme', euro(k.groessteEinnahme.amount)]] : [],
            text: 'Alle Bankbuchungen im Zeitraum außer Umbuchungen zwischen eigenen Konten.',
          }}
        />
      </div>
      {/* Fades zeigen am Handy, dass die Leiste weiterscrollt; am Desktop passt alles. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 rounded-l-lg bg-gradient-to-r from-card to-transparent lg:hidden" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-card to-transparent lg:hidden" />
    </section>
  )
}
