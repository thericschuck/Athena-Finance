// Reine Regeln des Sparplan-Laufs (execute-savings-plans). Ohne Imports und ohne `Deno`-Global, damit der
// Node-Testlauf des Projekts sie direkt laden kann (src/lib/api/sparplan-regeln.test.ts).

/**
 * Wie alt der Kurs in `fund_price_cache` höchstens sein darf, damit er als Ausführungskurs taugt: 72 Stunden.
 *
 * Gemessen wird `fetched_at`, also WANN der Kurs zuletzt abgerufen wurde, nicht das Kursdatum: fetch-fund-price
 * schreibt es bei jedem erfolgreichen Abruf, auch bei unverändertem Kurs. Damit prüft die Grenze, ob der Abruf
 * noch läuft (Yahoo-Ticker kaputt, Yahoo sperrt, Cron-Job abgemeldet), und nicht, ob der Fonds gehandelt wurde.
 *
 * Warum 72 und nicht 24 oder 48:
 *   - Der Sparplan-Job läuft täglich um 09:00 UTC, fetch-fund-price nur Mo bis Fr zwischen 08:00 und 20:45 UTC.
 *     Der letzte Abruf vor dem Wochenende ist Freitag ~20:45 UTC. Am Sonntag um 09:00 UTC ist der Kurs deshalb
 *     im Normalbetrieb ~36 Stunden alt. 24 Stunden würden jeden Samstag und Sonntag ausfallen lassen.
 *   - 72 Stunden sind dieses Normalmaximum plus ein ganzer ausgefallener Abruftag. 48 Stunden wären schon bei
 *     einem einzigen verpassten Montagsabruf überschritten (Fr 20:45 bis Mo 09:00 sind 60 Stunden), obwohl der
 *     Freitagsschlusskurs am Montagmorgen der richtige Kurs wäre: Fondsanteile werden zum Schlusskurs des
 *     Handelstages abgerechnet, einen frischeren gibt es montags früh gar nicht.
 *   - Das Ziel ist, einen Kurs von vor Wochen auszuschließen. Bei einem Fonds, der um 1 bis 2 Prozent am Tag
 *     schwankt, verschiebt ein drei Tage alter Kurs eine 25-Euro-Rate um Centbeträge.
 *
 * Wird der Kurs abgelehnt, überspringt der Lauf den Plan. Er bleibt „fällig" und wird am nächsten Tag erneut
 * versucht, es geht nichts verloren, die Ausführung verschiebt sich höchstens.
 */
export const MAX_KURSALTER_STUNDEN = 72

const STUNDE_MS = 3_600_000

/**
 * Alter des Kurses in Stunden, `null` wenn `fetched_at` fehlt oder kein Zeitstempel ist.
 * Ein Zeitstempel in der Zukunft (Uhrenabweichung) ergibt ein negatives Alter und gilt als frisch.
 */
export function kursAlterStunden(fetchedAt: string | null | undefined, jetzt: Date): number | null {
  if (!fetchedAt) return null
  const t = Date.parse(fetchedAt)
  if (Number.isNaN(t)) return null
  return (jetzt.getTime() - t) / STUNDE_MS
}

/** Darf dieser Kurs als Ausführungskurs verwendet werden? Ohne gültigen Zeitstempel: nein. */
export function kursIstFrisch(
  fetchedAt: string | null | undefined,
  jetzt: Date,
  maxStunden: number = MAX_KURSALTER_STUNDEN,
): boolean {
  const alter = kursAlterStunden(fetchedAt, jetzt)
  return alter !== null && alter <= maxStunden
}

/**
 * Erster Tag des Monats und erster Tag des Folgemonats zu einem Datum `JJJJ-MM-TT`, für eine Bereichsabfrage auf
 * eine DATE-Spalte: `.gte('transaction_date', von).lt('transaction_date', bis)`.
 *
 * Nicht `.like('transaction_date', 'JJJJ-MM-%')`: `date ~~ text` gibt es in Postgres nicht, die Abfrage endet mit
 * `operator does not exist` (42883). Der Fehler wurde nie gelesen, die Prüfung „schon gebucht?" fand deshalb nie
 * etwas, und der Plan wurde ab dem Ausführungstag jeden Tag erneut gebucht (AUDIT.md A1).
 */
export function monatsGrenzen(heute: string): { von: string; bis: string } {
  const [jahr, monat] = heute.split('-').map(Number)
  const nachfolgerJahr = monat === 12 ? jahr + 1 : jahr
  const nachfolgerMonat = monat === 12 ? 1 : monat + 1
  const form = (j: number, m: number) => `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
  return { von: form(jahr, monat), bis: form(nachfolgerJahr, nachfolgerMonat) }
}
