/**
 * Ein Zeitraum-Vokabular für die ganze App.
 *
 * Vorher hatte jede Seite ihre eigene Liste und ihre eigene Cutoff-Rechnung: die Analyse
 * kannte `1M/3M/6M/1J/Alles`, die Bank-Seite `3M/6M/1J/Alles`, der Kontostand-Chart
 * `1W/1M/3M/6M/1J/All`. Drei Schreibweisen für „alles" (`Alles`, `All`) und drei Cutoff-
 * Funktionen, die dasselbe taten. Ein Zeitraum, den man auf einer Seite wählt, ließ sich
 * deshalb nicht auf eine andere übertragen.
 */

export const PERIODS = ['1W', '1M', '3M', '6M', '1J', 'Alles'] as const
export type Period = typeof PERIODS[number]

/**
 * Ein Jahr. Die Kontohistorie reicht über zwei Jahre zurück; mit „Alles“ als Standard
 * schrumpfen die jüngsten Bewegungen — die man normalerweise sucht — zu einem Kringel am
 * rechten Rand, und mit 6M fällt der Jahresvergleich raus.
 */
export const DEFAULT_PERIOD: Period = '1J'

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value)
}

/** Akzeptiert alles aus der URL und fällt auf `fallback` zurück. */
export function parsePeriod(value: unknown, fallback: Period = DEFAULT_PERIOD): Period {
  return isPeriod(value) ? value : fallback
}

/**
 * Erster Tag des Zeitraums als `YYYY-MM-DD`, oder `null` für „Alles".
 *
 * Bewusst `null` statt eines Datums weit in der Vergangenheit: ein Aufrufer, der auf ein
 * Datum vergleicht, würde bei `'2000-01-01'` Buchungen von 1998 stillschweigend ausblenden.
 * `null` zwingt dazu, den Fall „kein Filter" explizit zu behandeln.
 */
/**
 * Verschiebt um Monate und kappt aufs Monatsende: `setMonth` allein machte aus dem 31.05. minus
 * 3 Monate den 03.03. (28.02. + Überlauf) und verkürzte jeden Zeitraum an Monatsenden um Tage;
 * aus dem 29.02. minus 1 Jahr wurde der 01.03.
 */
function addMonthsClamped(d: Date, delta: number): void {
  const tag = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(tag, letzter))
}

export function periodCutoff(period: Period, today = new Date()): string | null {
  const d = new Date(today)
  switch (period) {
    case '1W':  d.setDate(d.getDate() - 7);          break
    case '1M':  addMonthsClamped(d, -1);             break
    case '3M':  addMonthsClamped(d, -3);             break
    case '6M':  addMonthsClamped(d, -6);             break
    case '1J':  addMonthsClamped(d, -12);            break
    case 'Alles': return null
  }
  // Lokale Kalenderteile, nicht toISOString(): das rechnet erst nach UTC um und würde
  // zwischen Mitternacht und 2 Uhr MESZ auf den Vortag zurückfallen.
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** `true`, wenn `date` (YYYY-MM-DD) im Zeitraum liegt. */
export function inPeriod(date: string, period: Period, today = new Date()): boolean {
  const cutoff = periodCutoff(period, today)
  return cutoff === null || date >= cutoff
}

/**
 * Achsenbeschriftung passend zur Spannweite: bei kurzen Zeiträumen Tag+Monat, bei langen
 * Monat+Jahr. Ohne das steht bei „Alles" zwölfmal „Jan" auf der Achse, wenn die Daten über
 * mehrere Jahre laufen.
 */
export function periodDateFormat(period: Period): Intl.DateTimeFormatOptions {
  return period === '1W' || period === '1M'
    ? { day: '2-digit', month: 'short' }
    : { month: 'short', year: '2-digit' }
}

/**
 * Wie viele Monate eine Monatsübersicht für den Zeitraum zeigt. „Alles" bleibt bei 24: das
 * ist der Horizont der Verteilungs-Karte, mehr Monate liefern die Auswertungen nicht.
 * Mindestens ein Monat, auch bei 1W.
 */
export function monthsForPeriod(period: Period): number {
  switch (period) {
    case '1W':
    case '1M':    return 1
    case '3M':    return 3
    case '6M':    return 6
    case '1J':    return 12
    case 'Alles': return 24
  }
}

/** Lokales Datum als `YYYY-MM-DD` (nicht `toISOString()`, das erst nach UTC umrechnet). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
