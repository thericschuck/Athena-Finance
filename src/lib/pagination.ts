/**
 * Seiteneinteilung für server-seitig paginierte Listen.
 *
 * Liegt als eigenes Modul und nicht in der Blätterleiste, weil beide Seiten derselben
 * Münze es brauchen: der Server, um Bereich und Seitengröße aus der URL zu lesen, und die
 * Leiste im Browser, um sie zu schreiben. Zwei Kopien der erlaubten Werte wären der Weg zu
 * einem `per=100`, das der Server auf 50 abschneidet, während die Leiste 100 anzeigt.
 */

/**
 * Wählbare Seitengrößen.
 *
 * Eine Auswahlliste und keine freie Zahl, und das ist keine Bequemlichkeit: der Parameter
 * kommt aus der Adresszeile. `per=100000` wäre sonst die Aufforderung, 100.000 Zeilen zu
 * rendern — bei drei Client-Komponenten je Zeile reicht das, um den Browser stehen zu lassen.
 */
export const PAGE_SIZE_OPTIONS = [50, 75, 100] as const

export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

/**
 * Obergrenze für die Seitenzahl. Sie wird direkt zum OFFSET der Abfrage — `page=99999999`
 * wäre sonst die Aufforderung an die Datenbank, Millionen Zeilen zu überspringen.
 */
export const MAX_PAGE = 10_000

/** Seitenzahl aus der URL. Alles Unbrauchbare wird Seite 1. */
export function parsePage(value: string | null | undefined): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 1) return 1
  return Math.min(n, MAX_PAGE)
}

/** Seitengröße aus der URL — nur die angebotenen Werte, sonst die Voreinstellung. */
export function parsePageSize(value: string | null | undefined): number {
  const n = Number(value)
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
}
