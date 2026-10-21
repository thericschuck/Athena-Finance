/** Was die Vererbung braucht -- mehr nicht, damit die Funktion testbar bleibt. */
export type Kategorieknoten = {
  id: string
  parent_id: string | null
  tax_role: string | null
  /** Zeile der Anlage EUER. Erst ab der Migration 20260906180000 vorhanden. */
  euer_zeile?: number | null
  /** Betrieblicher Anteil in Prozent (0-100), null = 100. Erst ab Migration 20261021150000. */
  business_share?: number | null
}

/**
 * Die effektive steuerliche Rolle je Kategorie, inklusive Vererbung: hat eine
 * Kategorie keine eigene Rolle, gilt die der naechsten Oberkategorie. Damit
 * reicht ein Klick auf "Business", um den ganzen Teilbaum zuzuordnen.
 *
 * Die Schleife nach oben ist gegen einen Zyklus abgesichert. Das Datenmodell
 * verhindert `parent_id`-Zyklen nicht, und ein Zyklus wuerde hier sonst die
 * ganze Steuerseite haengen lassen.
 */
function vererbtesFeld<T>(
  kategorien: Kategorieknoten[],
  lese: (k: Kategorieknoten) => T | null,
): Map<string, T | null> {
  const nachId = new Map(kategorien.map(k => [k.id, k]))
  const ergebnis = new Map<string, T | null>()

  for (const start of kategorien) {
    let aktuell: typeof start | undefined = start
    const gesehen = new Set<string>()
    let wert: T | null = null

    while (aktuell && !gesehen.has(aktuell.id)) {
      gesehen.add(aktuell.id)
      const eigener = lese(aktuell)
      if (eigener !== null && eigener !== undefined) {
        wert = eigener
        break
      }
      aktuell = aktuell.parent_id ? nachId.get(aktuell.parent_id) : undefined
    }
    ergebnis.set(start.id, wert)
  }
  return ergebnis
}

/** Die steuerliche Rolle je Kategorie, inklusive Vererbung. */
export function effektiveRollen(kategorien: Kategorieknoten[]): Map<string, string | null> {
  return vererbtesFeld(kategorien, k => k.tax_role)
}

/**
 * Die EUER-Zeile je Kategorie, inklusive Vererbung. Getrennt von der Rolle,
 * weil beides unabhaengig gesetzt wird: eine Unterkategorie kann die Rolle der
 * Oberkategorie uebernehmen und trotzdem in einer eigenen Formularzeile landen.
 */
export function effektiveEuerZeilen(kategorien: Kategorieknoten[]): Map<string, number | null> {
  return vererbtesFeld(kategorien, k => k.euer_zeile ?? null)
}

/**
 * Der betriebliche Anteil je Kategorie in Prozent (0-100), inklusive Vererbung. `null` heisst
 * 100 %: ohne eigenen Wert in der ganzen Kette ist die Ausgabe voll betrieblich. Wirkt nur auf
 * Betriebsausgaben (siehe `wendeAnteilAn`).
 */
export function effektiveAnteile(kategorien: Kategorieknoten[]): Map<string, number | null> {
  return vererbtesFeld(kategorien, k => k.business_share ?? null)
}

/**
 * Rechnet den betrieblichen Anteil auf einen Betrag an. Wertebereich wird begrenzt (0-100), damit
 * ein kaputter Wert die Steuer nicht ueber den Buchungsbetrag hinaus verzerrt. `null`/fehlend = 100 %.
 */
export function wendeAnteilAn(betrag: number, anteilProzent: number | null | undefined): number {
  if (anteilProzent === null || anteilProzent === undefined || !Number.isFinite(anteilProzent)) return betrag
  const anteil = Math.min(100, Math.max(0, anteilProzent)) / 100
  return Math.round(betrag * anteil * 100) / 100
}
