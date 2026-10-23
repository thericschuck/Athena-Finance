/**
 * Kernaussage der Verteilungs-Karte als ein Satz. Rein, damit der Wortlaut testbar ist und
 * die Karte selbst nur noch anzeigt.
 */

/** Wo der laufende Monat in der eigenen Historie liegt — ohne Wertung. */
export type Lage = 'oben' | 'mitte' | 'unten'

export function lageImVerlauf(percentile: number): Lage {
  if (percentile >= 75) return 'oben'
  if (percentile <= 25) return 'unten'
  return 'mitte'
}

const LAGE_TEXT: Record<Lage, string> = {
  oben:  'im oberen Viertel',
  mitte: 'im üblichen Bereich',
  unten: 'im unteren Viertel',
}

export interface KernaussageEingabe {
  /** Beträge der abgeschlossenen Monate. */
  anzahlMonate: number
  median:       number
  /** `null`, solange im laufenden Monat nichts gebucht ist. */
  aktuell:      number | null
  /** Perzentil des laufenden Monats (0–100), falls vorhanden. */
  percentile:   number | null
  /** Anzahl Monate der Historie, die kleiner sind als der laufende. */
  darunter:     number | null
}

/**
 * „Dieser Monat: 1.234 € — im oberen Viertel (höher als in 15 von 18 Monaten). Typisch
 * (Median): 1.100 €." Ohne laufenden Monat nur der typische Wert.
 */
export function kernaussage(e: KernaussageEingabe, fmt: (n: number) => string): string {
  const typisch = `Typisch (Median): ${fmt(e.median)}.`
  if (e.aktuell == null || e.percentile == null || e.darunter == null) {
    return `Ein typischer Monat liegt bei ${fmt(e.median)} (Median der letzten ${e.anzahlMonate} Monate).`
  }
  return `Dieser Monat: ${fmt(e.aktuell)} — ${LAGE_TEXT[lageImVerlauf(e.percentile)]} `
    + `(höher als in ${e.darunter} von ${e.anzahlMonate} Monaten). ${typisch}`
}
