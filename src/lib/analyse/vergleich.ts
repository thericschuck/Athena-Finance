/**
 * Zeitfenster der Analyse-Seite und der Vergleichszeitraum dazu. Rein, ohne Datenbank.
 *
 * Alles läuft auf MONATSEBENE, wie die Monatssummen (`monthly_flows`) und die Bankdaten-Seite
 * (lib/bank/scope.ts): ein Zeitraum zählt ab dem Monat seines Cutoffs, ganze Monate. Ein
 * tagesgenauer Vergleich wäre bei Monatssummen gar nicht möglich.
 *
 * Vergleichsmodi:
 *  - `vorperiode`: gleich viele Monate direkt vor dem Fenster.
 *  - `vorjahr`:    dasselbe Fenster ein Jahr früher.
 *  - `aus`:        kein Vergleich.
 * Für „Alles" und eine Woche gibt es keinen belastbaren Vergleich (`null`).
 */

export const VERGLEICHE = ['vorperiode', 'vorjahr', 'aus'] as const
export type VergleichsModus = typeof VERGLEICHE[number]

export const VERGLEICH_STANDARD: VergleichsModus = 'vorperiode'

export function parseVergleich(wert: string | null | undefined): VergleichsModus {
  return (VERGLEICHE as readonly string[]).includes(wert ?? '') ? (wert as VergleichsModus) : VERGLEICH_STANDARD
}

/** Monatsfenster: beide Grenzen sind Monatserste (`YYYY-MM-01`) und inklusive. */
export interface Fenster {
  von: string
  bis: string
}

export const monatsErster = (datum: string): string => `${datum.slice(0, 7)}-01`

/** Monatserster `n` Monate vor/nach `monat` (`YYYY-MM-01` oder jedes Datum dieses Monats). */
export function monatPlus(monat: string, n: number): string {
  const [j, m] = monat.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

/** Anzahl Monate zwischen zwei Monatsersten, inklusive beider Enden. */
export function monateInFenster(f: Fenster): number {
  const [j1, m1] = f.von.slice(0, 7).split('-').map(Number)
  const [j2, m2] = f.bis.slice(0, 7).split('-').map(Number)
  return (j2 - j1) * 12 + (m2 - m1) + 1
}

/**
 * Das aktuelle Fenster: vom Monat des Cutoffs bis zum laufenden Monat. `null` bei „Alles"
 * (kein Cutoff) — dann gilt die ganze Historie.
 */
export function aktuellesFenster(cutoff: string | null, heute: string): Fenster | null {
  if (!cutoff) return null
  return { von: monatsErster(cutoff), bis: monatsErster(heute) }
}

/**
 * Das Vergleichsfenster zum aktuellen. `null`, wenn es keinen belastbaren Vergleich gibt:
 * Modus `aus`, Zeitraum „Alles", oder eine Woche (ein Monatsvergleich für 7 Tage wäre Zufall).
 */
export function vergleichsFenster(
  periode: string, cutoff: string | null, heute: string, modus: VergleichsModus,
): Fenster | null {
  if (modus === 'aus' || periode === '1W') return null
  const aktuell = aktuellesFenster(cutoff, heute)
  if (!aktuell) return null
  if (modus === 'vorjahr') {
    return { von: monatPlus(aktuell.von, -12), bis: monatPlus(aktuell.bis, -12) }
  }
  const n = monateInFenster(aktuell)
  return { von: monatPlus(aktuell.von, -n), bis: monatPlus(aktuell.von, -1) }
}

/** Liegt der Monat (`YYYY-MM-DD`, beliebiger Tag) im Fenster? `null` = ohne Grenze. */
export function imFenster(monat: string, f: Fenster | null): boolean {
  if (!f) return true
  const m = monatsErster(monat)
  return m >= f.von && m <= f.bis
}

/**
 * Erster Monat der ZUSAMMENHÄNGENDEN Historie: vom jüngsten Monat rückwärts, solange keine Lücke
 * von mehr als `maxLuecke` fehlenden Monaten kommt. Einzelne Streumonate weit davor (ein
 * Altbestand aus 2018, ein Import aus 2021) gehören nicht dazu — sonst gälte jeder Vergleich als
 * „abgedeckt", obwohl dazwischen Jahre ohne Daten liegen. `null` ohne Monate.
 * `monate`: beliebige Daten `YYYY-MM-...`, unsortiert und mit Duplikaten erlaubt.
 */
export function zusammenhaengenderBeginn(monate: readonly string[], maxLuecke = 2): string | null {
  const einzigartig = [...new Set(monate.map(monatsErster))].sort()
  if (einzigartig.length === 0) return null
  let beginn = einzigartig[einzigartig.length - 1]
  for (let i = einzigartig.length - 2; i >= 0; i--) {
    const abstand = monateInFenster({ von: einzigartig[i], bis: beginn }) - 1
    if (abstand - 1 > maxLuecke) break
    beginn = einzigartig[i]
  }
  return beginn
}

/**
 * Hat die Historie das Vergleichsfenster überhaupt abgedeckt? `fruehesterMonat` ist der erste
 * Monat, für den es Daten gibt. Beginnt die Historie erst NACH dem Start des Vergleichsfensters,
 * wäre jede Differenz ein Zuwachs, der nur vom fehlenden Vergleich kommt.
 */
export function vergleichBelastbar(vergleich: Fenster | null, fruehesterMonat: string | null): boolean {
  if (!vergleich || !fruehesterMonat) return false
  return monatsErster(fruehesterMonat) <= vergleich.von
}
