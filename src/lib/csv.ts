/**
 * Ein CSV-Dialekt für die ganze App.
 *
 * Export (api/export/transactions) und Import (components/finance/transaction-csv) hatten
 * ihre eigene Vorstellung davon, wie eine Zahl in einer CSV aussieht: der Export schrieb
 * `-1234.56` mit `,` als Spaltentrenner, der Import las den Betrag mit einem simplen
 * `replace(',', '.')`. Beide zusammen ergaben eine Datei, die deutsches Excel still falsch
 * interpretiert — der Punkt gilt dort als Tausendertrennung, aus −1234.56 wird −123456, und
 * der Komma-Trenner zerlegt jede Zahl zusätzlich in zwei Spalten.
 *
 * Deshalb liegt die Konvention jetzt an EINER Stelle.
 */

/**
 * Spaltentrenner.
 *
 * `;`, nicht `,` — sobald das Komma als Dezimaltrennzeichen dient, kann es nicht mehr
 * Spalten trennen. Unter einer deutschen Windows-Locale ist `;` ohnehin Excels
 * Standard-Listentrennzeichen, die Datei öffnet sich also mit einem Doppelklick richtig.
 */
export const CSV_SEPARATOR = ';'

/**
 * Byte Order Mark.
 *
 * Ohne ihn rät Excel die Kodierung und landet unter Windows bei ANSI — aus „Händler" wird
 * dann „HÃ¤ndler". Beim Einlesen muss er wieder weg, sonst klebt er am ersten Spaltennamen.
 */
export const CSV_BOM = '\uFEFF'

/** Zeilenende. CRLF, weil ältere Excel-Versionen mit reinem LF Zeilen zusammenziehen. */
export const CSV_EOL = '\r\n'

/**
 * `1234.5` → `"1234,50"`.
 *
 * Bewusst ohne Tausenderpunkte: die wären beim Reimport nur eine weitere Mehrdeutigkeit,
 * und Excel formatiert die Spalte beim Öffnen ohnehin nach eigener Einstellung.
 */
export function formatCsvAmount(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/**
 * Betrag aus einer CSV lesen — deutsche wie englische Schreibweise.
 *
 * Bis August 2026 schrieb der eigene Export `-1234.56`, seither `-1234,56`. Alte Dateien
 * müssen weiter importierbar bleiben, und wer eine Datei in Excel öffnet und speichert,
 * bekommt womöglich noch Tausendertrennzeichen dazu.
 *
 * Regel: Das ZULETZT stehende Trennzeichen ist das Dezimaltrennzeichen, alles davor ist
 * Tausendertrennung.
 */
export function parseCsvAmount(raw: string): number {
  if (!raw) return 0
  // Währungssymbol abschneiden, falls die Datei durch Excel gelaufen ist.
  const str = raw.trim().replace(/\s*(EUR|€)\s*$/i, '').trim()
  if (!str) return 0

  const komma = str.lastIndexOf(',')
  const punkt = str.lastIndexOf('.')

  let cleaned: string
  if (komma > punkt) {
    // Deutsch: 1.234,56
    cleaned = str.replace(/\./g, '').replace(',', '.')
  } else if (punkt > komma) {
    // Entweder englisch (1234.56) oder deutsche Tausendertrennung ohne Nachkommastellen
    // (1.234). Unterschieden an der letzten Gruppe: genau drei Ziffern und nirgends ein
    // Komma heißt Tausender — mit zwei Nachkommastellen wäre es ein Dezimalpunkt.
    const nachkomma = str.length - punkt - 1
    cleaned = nachkomma === 3 && komma === -1
      ? str.replace(/\./g, '')
      : str.replace(/,/g, '')
  } else {
    cleaned = str
  }

  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : value
}

/**
 * Feld für die Ausgabe maskieren.
 *
 * Anführungszeichen nur, wenn nötig — sonst ist die halbe Datei gequotet. Neben dem
 * Trennzeichen müssen auch Zeilenumbrüche maskiert werden: ein Verwendungszweck mit
 * Zeilenumbruch reißt sonst die Tabelle auseinander.
 */
export function escapeCsvValue(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (
    str.includes(CSV_SEPARATOR) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
