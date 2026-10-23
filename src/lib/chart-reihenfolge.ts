/**
 * Einheitliche Reihenfolge in Charts mit mehreren Farben oder Flächen.
 *
 * Regel: Legende und Hover-Tooltip führen die Serien in DERSELBEN Reihenfolge, und die ist
 * die, in der man sie im Chart sieht. Bei gestapelten Flächen oder Balken heißt das: oben
 * zuerst, unten zuletzt. Recharts liefert den Tooltip in Zeichenreihenfolge — bei einem
 * Stapel also UNTEN zuerst —, während eine Legende, die man in Zeichenreihenfolge baut,
 * dasselbe zeigt wie der Tooltip, aber verkehrt zum Bild. Das Auge springt dann bei jedem
 * Blick vom Chart in die Legende. Beides aus einer einzigen Liste abzuleiten, verhindert,
 * dass sie auseinanderlaufen.
 *
 * Verwendung:
 *   const reihenfolge = anzeigeReihenfolge(schichtKeysVonUntenNachOben)   // oben zuerst
 *   <Tooltip itemSorter={tooltipSortierer(reihenfolge)} />
 *   legende: reihenfolge.map(...)
 * Serien, die nicht in der Liste stehen (Prognose-, Vergleichs- und Hilfslinien), kommen
 * hinter den gelisteten.
 */

/** Zeichenreihenfolge eines Stapels (unten zuerst) -> Anzeigereihenfolge (oben zuerst). */
export function anzeigeReihenfolge<T>(vonUntenNachOben: readonly T[]): T[] {
  return [...vonUntenNachOben].reverse()
}

/** `itemSorter` für den Recharts-Tooltip: sortiert nach Position in `reihenfolge`. */
export function tooltipSortierer(reihenfolge: readonly string[]) {
  return (item: { dataKey?: unknown; name?: unknown }): number => {
    const keys = [item.dataKey, item.name].map(v => (v == null ? '' : String(v)))
    for (const k of keys) {
      const i = reihenfolge.indexOf(k)
      if (i >= 0) return i
    }
    return reihenfolge.length
  }
}
