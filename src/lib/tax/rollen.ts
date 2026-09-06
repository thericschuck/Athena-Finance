/** Was die Vererbung braucht -- mehr nicht, damit die Funktion testbar bleibt. */
export type Kategorieknoten = { id: string; parent_id: string | null; tax_role: string | null }

/**
 * Die effektive steuerliche Rolle je Kategorie, inklusive Vererbung: hat eine
 * Kategorie keine eigene Rolle, gilt die der naechsten Oberkategorie. Damit
 * reicht ein Klick auf "Business", um den ganzen Teilbaum zuzuordnen.
 *
 * Die Schleife nach oben ist gegen einen Zyklus abgesichert. Das Datenmodell
 * verhindert `parent_id`-Zyklen nicht, und ein Zyklus wuerde hier sonst die
 * ganze Steuerseite haengen lassen.
 */
export function effektiveRollen(kategorien: Kategorieknoten[]): Map<string, string | null> {
  const nachId = new Map(kategorien.map(k => [k.id, k]))
  const ergebnis = new Map<string, string | null>()

  for (const start of kategorien) {
    let aktuell: typeof start | undefined = start
    const gesehen = new Set<string>()
    let rolle: string | null = null

    while (aktuell && !gesehen.has(aktuell.id)) {
      gesehen.add(aktuell.id)
      if (aktuell.tax_role) {
        rolle = aktuell.tax_role
        break
      }
      aktuell = aktuell.parent_id ? nachId.get(aktuell.parent_id) : undefined
    }
    ergebnis.set(start.id, rolle)
  }
  return ergebnis
}
