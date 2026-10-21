import { monatVon } from './datum.ts'

/**
 * Rückblick für die Prognose-Diagramme aus den Tages-Snapshots (`net_worth_snapshots`).
 * Keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt laden kann.
 */

export type SnapshotZeile = {
  snapshot_date: string
  net_worth: number
  total_checking: number
  total_savings: number
  total_cash: number
}

export type VerlaufPunkt = { datum: string; liquiditaet: number; vermoegen: number }

/**
 * Der letzte Snapshot jedes ABGESCHLOSSENEN Monats (Stand am Monatsende, soweit vorhanden). Liquidität
 * = Giro + Spar + Bargeld, dieselben Töpfe wie bei der Prognose; Vermögen = Nettovermögen des
 * Snapshots. Der laufende Monat fehlt, dafür steht der Live-Wert von heute. Aufsteigend, höchstens
 * `anzahl` Monate.
 */
export function monatsenden(snaps: SnapshotZeile[], heute: string, anzahl = 6): VerlaufPunkt[] {
  const aktuell = monatVon(heute)
  const letzte = new Map<string, SnapshotZeile>()
  for (const s of snaps) {
    const monat = monatVon(s.snapshot_date)
    if (monat >= aktuell) continue
    const bisher = letzte.get(monat)
    if (!bisher || s.snapshot_date > bisher.snapshot_date) letzte.set(monat, s)
  }
  return [...letzte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-anzahl)
    .map(([, s]) => ({
      datum: s.snapshot_date.slice(0, 10),
      liquiditaet: Math.round((Number(s.total_checking) + Number(s.total_savings) + Number(s.total_cash)) * 100) / 100,
      vermoegen: Math.round(Number(s.net_worth) * 100) / 100,
    }))
}
