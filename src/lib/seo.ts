/**
 * Feste Angaben zur Website, die an mehreren Stellen gebraucht werden:
 * Metadaten, robots.txt, sitemap.xml und die strukturierten Daten (JSON-LD).
 *
 * An einer Stelle, weil eine Domain, die in vier Dateien getrennt notiert ist,
 * garantiert irgendwann in dreien richtig steht.
 */
export const SITE = {
  url: 'https://athena-finance.de',
  name: 'Athena Finance',
  /** Steht bereits im Impressum — hier nur als Urheber-Angabe für Suchmaschinen. */
  author: 'Eric Schuck',
  locale: 'de_DE',
  lang: 'de-DE',
  /** Wird als Default-Beschreibung und in den strukturierten Daten verwendet. */
  description:
    'Konten, Depot, Verträge und Krypto in einer einzigen Ansicht. Jede Zahl stammt '
    + 'aus einer echten Buchung — keine Schätzung, keine Hochrechnung.',
} as const

/**
 * Alle Pfade, die eine Suchmaschine sehen darf. Der gesamte eingeloggte Bereich
 * fehlt hier bewusst: er ist zwar ohnehin durch die Middleware geschützt und
 * würde einen Crawler nur auf /login umleiten, aber jede solche Umleitung ist
 * verschwendetes Crawl-Budget und erzeugt in der Search Console Rauschen
 * („Seite mit Weiterleitung"), das echte Fehler schwerer auffindbar macht.
 */
export const PUBLIC_PATHS = ['/', '/interesse'] as const

/**
 * Bereiche hinter dem Login. Als Präfixe formuliert, damit Unterseiten
 * (/finance/accounts, /strategy/tests …) mit abgedeckt sind.
 */
export const PRIVATE_PREFIXES = [
  '/api/',
  '/analyse',
  '/assistant',
  '/crypto',
  '/dashboard',
  '/depot',
  '/finance',
  '/inventar',
  '/investing',
  '/login',
  '/settings',
  '/strategy',
] as const

/** Absolute URL für einen Pfad — Suchmaschinen erwarten in sitemap.xml und in
    JSON-LD absolute Adressen, relative werden ignoriert. */
export function abs(path: string) {
  return new URL(path, SITE.url).toString()
}
