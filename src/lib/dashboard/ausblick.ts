import { addTage } from '../forecast/datum.ts'

/**
 * Reine Logik des Dashboard-Ausblicks „Liquidität": welche Tage der Prognose der kleine Chart
 * zeigt, wo der Tiefpunkt liegt und wie die Kernaussage (Satz + Ampelfarbe) lautet. Keine
 * Imports ausser dem Kalenderrechnen, damit `node --test` die Datei direkt laden kann.
 *
 * Die Prognose selbst (lib/forecast) wird hier nicht neu gerechnet: das Dashboard zeigt dieselben
 * Zahlen wie die Prognose-Seite, nur kleiner und auf die nächsten Wochen beschnitten.
 */

/** Wählbare Zeiträume des Umschalters (Tage ab heute). */
export const AUSBLICK_ZEITRAEUME = [30, 60, 90] as const
export type AusblickZeitraum = typeof AUSBLICK_ZEITRAEUME[number]
export const AUSBLICK_STANDARD: AusblickZeitraum = 60

/**
 * Unter diesem erwarteten Tiefpunkt (in €) wird der Ausblick gelb: nominell noch im Plus, aber
 * ein einzelner unerwarteter Posten reicht für das Minus. Absolut statt relativ, weil die
 * Prognose bei kleinen Konten sonst nie warnen würde und bei grossen ständig.
 */
export const SCHWELLE_KNAPP = 500

/** Ampel: ok = bleibt komfortabel, knapp = Vorsicht, minus = erwartet unter 0. */
export type AusblickStufe = 'ok' | 'knapp' | 'minus'

/** Reduzierter Punkt fürs Client-Chart (kurze Schlüssel: ~90 Punkte wandern ins HTML). */
export interface AusblickPunkt {
  /** YYYY-MM-DD */
  d: string
  /** erwartete Liquidität */
  e: number
  /** untere / obere Grenze des 80-%-Bereichs */
  u: number
  o: number
}

/** Form eines Prognosetags, soweit wir sie brauchen (strukturell kompatibel zu PrognoseTag). */
export interface TagQuelle {
  datum: string
  liquiditaet: number
  liquiditaetUnten: number
  liquiditaetOben: number
}

const runde = (n: number) => Math.round(n)

/**
 * Die Tage von `heute` bis `heute + maxTage` (einschliesslich), auf ganze Euro gerundet.
 * Ganze Euro reichen für einen 120-px-Chart und halten die Daten zum Client klein.
 */
export function reduziereTage(tage: readonly TagQuelle[], heute: string, maxTage: number): AusblickPunkt[] {
  const bis = addTage(heute, maxTage)
  return tage
    .filter(t => t.datum >= heute && t.datum <= bis)
    .map(t => ({ d: t.datum, e: runde(t.liquiditaet), u: runde(t.liquiditaetUnten), o: runde(t.liquiditaetOben) }))
}

/** Die ersten `tage` Tage der Punkte (für den Umschalter 30/60/90). */
export function fensterPunkte(punkte: readonly AusblickPunkt[], heute: string, tage: number): AusblickPunkt[] {
  const bis = addTage(heute, tage)
  return punkte.filter(p => p.d <= bis)
}

export interface AusblickTiefpunkt {
  betrag: number
  datum: string
}

/** Tiefster erwarteter Stand und tiefste untere Bereichsgrenze; bei Gleichstand gewinnt der frühere Tag. */
export function tiefpunkte(punkte: readonly AusblickPunkt[]): { erwartet: AusblickTiefpunkt; risiko: AusblickTiefpunkt } | null {
  if (punkte.length === 0) return null
  let erwartet = { betrag: punkte[0].e, datum: punkte[0].d }
  let risiko = { betrag: punkte[0].u, datum: punkte[0].d }
  for (const p of punkte) {
    if (p.e < erwartet.betrag) erwartet = { betrag: p.e, datum: p.d }
    if (p.u < risiko.betrag) risiko = { betrag: p.u, datum: p.d }
  }
  return { erwartet, risiko }
}

/**
 * Ampel aus den beiden Tiefpunkten:
 *  - rot (`minus`): der ERWARTETE Verlauf geht unter 0. Das ist keine Möglichkeit, sondern die
 *    Prognose selbst.
 *  - gelb (`knapp`): erwartet unter {@link SCHWELLE_KNAPP}, ODER nur die untere Bereichsgrenze
 *    (1 von 10 Verläufen) geht unter 0. Letzteres bewusst nicht rot: der 80-%-Bereich ist bei
 *    unregelmässigen Ausgaben breit, und ein ständig roter Ausblick würde nicht mehr beachtet.
 *  - grün (`ok`): sonst.
 */
export function bewerteAusblick(
  erwartet: number, risiko: number, schwelle: number = SCHWELLE_KNAPP,
): AusblickStufe {
  if (erwartet < 0) return 'minus'
  if (erwartet < schwelle || risiko < 0) return 'knapp'
  return 'ok'
}

/** `28.11.` bzw. `11/28` je nach Datumsformat der Einstellungen. */
export function kurzDatum(iso: string, format = 'dd.MM.yyyy'): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  if (format === 'MM/dd/yyyy') return `${m}/${d}`
  if (format === 'yyyy-MM-dd') return `${m}-${d}`
  return `${d}.${m}.`
}

/**
 * Kernaussage in einem Satz. `euro` formatiert einen Betrag (Locale und Währung kennt der
 * Aufrufer), `datum` ein Datum kurz (siehe {@link kurzDatum}).
 */
export function ausblickSatz(
  tp: { erwartet: AusblickTiefpunkt; risiko: AusblickTiefpunkt },
  stufe: AusblickStufe,
  euro: (n: number) => string,
  datum: (iso: string) => string,
): string {
  const { erwartet, risiko } = tp
  if (stufe === 'minus') {
    return `Voraussichtlich im Minus: ca. ${euro(erwartet.betrag)} am ${datum(erwartet.datum)}`
  }
  if (stufe === 'knapp') {
    if (erwartet.betrag >= SCHWELLE_KNAPP && risiko.betrag < 0) {
      return `Meist ausreichend, im ungünstigen Fall Minus am ${datum(risiko.datum)}`
    }
    return `Wird knapp: tiefster Stand ca. ${euro(erwartet.betrag)} am ${datum(erwartet.datum)}`
  }
  return `Bleibt komfortabel: tiefster Stand ca. ${euro(erwartet.betrag)} am ${datum(erwartet.datum)}`
}
