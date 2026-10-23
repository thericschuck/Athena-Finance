/**
 * Reine Hilfen für den Monatsvergleich (Auswahl, Hervorhebung, Beschriftung).
 * Eigene Datei statt in der Chart-Komponente, damit sie ohne recharts testbar sind.
 */

const MONATE_LANG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** `2026-03` → „März 2026". Unbekannte Form: unverändert zurück. */
export function monatKlartext(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return key
  const name = MONATE_LANG[Number(m[2]) - 1]
  return name ? `${name} ${m[1]}` : key
}

/**
 * Wert für den URL-Filter `monat` nach einem Klick auf einen Balken: derselbe Monat nochmal
 * hebt die Auswahl auf (`null`), ein anderer ersetzt sie. Zeilen ohne `key` (z. B. die
 * Demodaten der Landingpage) sind nicht wählbar — dann `undefined` = nichts tun.
 */
export function naechsteMonatsauswahl(
  geklickt: string | undefined, aktuell: string | null,
): string | null | undefined {
  if (!geklickt) return undefined
  return geklickt === aktuell ? null : geklickt
}

/**
 * Deckkraft eines Balkens. Ohne Auswahl wie bisher (der laufende Monat blasser, weil
 * unvollständig). Mit Auswahl: der gewählte Monat voll, alle anderen zurückgenommen statt
 * ausgegraut — sie bleiben lesbar, der Vergleich funktioniert weiter.
 */
export function balkenDeckkraft(laufend: boolean, key: string | undefined, gewaehlt: string | null): number {
  if (!gewaehlt) return laufend ? 0.35 : 0.75
  if (key === gewaehlt) return laufend ? 0.6 : 1
  return 0.22
}

/** Breite je Monat in px, unter der die Balken zu schmal zum Antippen werden. */
export const MIN_PX_JE_MONAT = 30

/**
 * Mindestbreite des Charts für `monate` Monate. Auf schmalen Bildschirmen scrollt der Chart
 * waagerecht, statt 25 Monate in 170 px zu quetschen.
 */
export function mindestBreite(monate: number): number {
  return Math.max(0, monate) * MIN_PX_JE_MONAT
}
