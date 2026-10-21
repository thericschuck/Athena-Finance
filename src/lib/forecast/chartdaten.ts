import { addMonate, format, monatVon, parse, tageImMonat } from './datum.ts'
import type { VerlaufPunkt } from './verlauf.ts'

/**
 * Datenpunkte für die Prognose-Diagramme: Rückblick als durchgezogene Linie, ab „heute" gestrichelt
 * weiter. Die X-Achse ist eine echte Zeitachse (`t` = Millisekunden), damit „heute" an der richtigen
 * Stelle sitzt und die Monate nicht gleich breit erscheinen, obwohl der laufende nur Resttage hat.
 *
 * Der Punkt „heute" trägt `ist` UND `szenario` (und `basis`) mit demselben Wert: dadurch schließen
 * die durchgezogene und die gestrichelte Linie nahtlos aneinander an.
 *
 * Reine Funktion, keine Imports außer Datums-Helfern, damit `node --test` sie direkt lädt.
 */

export type ChartPunkt = {
  t: number
  datum: string
  /** Tatsächlicher Verlauf (Rückblick und heute). */
  ist?: number
  /** Prognose mit Annahmen (ohne Annahmen: die Prognose). */
  szenario?: number
  /** Prognose ohne Annahmen, nur gesetzt, wenn es Annahmen gibt. */
  basis?: number
}

export type ChartDaten = {
  liquiditaet: ChartPunkt[]
  vermoegen: ChartPunkt[]
  /** Zeitpunkt von „heute". */
  heute: number
  /** Tiefster Stand der Liquidität im Prognosezeitraum. */
  tiefpunkt: { t: number; wert: number } | null
  /** Erste Tage der Monate im Bereich, für die Achsenbeschriftung. */
  monatsanfaenge: number[]
}

export type PrognoseMonatLite = { month: string; liquiditaetEnde: number; vermoegenEnde: number }

export type ChartEingaben = {
  heute: string
  verlauf: VerlaufPunkt[]
  start: { liquiditaet: number; vermoegen: number }
  szenario: PrognoseMonatLite[]
  basis: PrognoseMonatLite[]
  tiefpunkt: { betrag: number; datum: string }
  mitAnnahmen: boolean
}

/** Mittag UTC: so verschiebt keine Zeitzone das Datum auf den Nachbartag. */
export const zeitpunkt = (datum: string): number => {
  const { y, m, d } = parse(datum)
  return Date.UTC(y, m - 1, d, 12)
}

function monatsende(monat: string): string {
  const { y, m } = parse(monat + '-01')
  return format(y, m, tageImMonat(y, m))
}

export function baueChartDaten(e: ChartEingaben): ChartDaten {
  const heuteT = zeitpunkt(e.heute)
  const basisNach = new Map(e.basis.map(m => [m.month, m]))

  const reihe = (feld: 'liquiditaet' | 'vermoegen'): ChartPunkt[] => {
    const punkte: ChartPunkt[] = e.verlauf.map(v => ({ t: zeitpunkt(v.datum), datum: v.datum, ist: v[feld] }))
    const start = e.start[feld]
    punkte.push({
      t: heuteT, datum: e.heute, ist: start, szenario: start, ...(e.mitAnnahmen ? { basis: start } : {}),
    })
    const feldEnde = feld === 'liquiditaet' ? 'liquiditaetEnde' : 'vermoegenEnde'
    for (const m of e.szenario) {
      const datum = monatsende(m.month)
      const t = zeitpunkt(datum)
      if (t <= heuteT) continue // der Monatsletzte ist heute oder schon vorbei: der Punkt „heute" gilt
      punkte.push({
        t, datum, szenario: m[feldEnde],
        ...(e.mitAnnahmen ? { basis: basisNach.get(m.month)?.[feldEnde] } : {}),
      })
    }
    return punkte.sort((a, b) => a.t - b.t)
  }

  const liquiditaet = reihe('liquiditaet')
  const vermoegen = reihe('vermoegen')

  // Monatsanfänge im Bereich beider Reihen.
  const alle = [...liquiditaet, ...vermoegen]
  const monatsanfaenge: number[] = []
  if (alle.length > 0) {
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
    const von = monatVon(iso(Math.min(...alle.map(p => p.t))))
    const bis = monatVon(iso(Math.max(...alle.map(p => p.t))))
    for (let m = von, i = 0; m <= bis && i < 120; m = addMonate(m, 1), i++) monatsanfaenge.push(zeitpunkt(m + '-01'))
  }

  const tiefpunkt = e.szenario.length > 0
    ? { t: zeitpunkt(e.tiefpunkt.datum), wert: e.tiefpunkt.betrag }
    : null

  return { liquiditaet, vermoegen, heute: heuteT, tiefpunkt, monatsanfaenge }
}
