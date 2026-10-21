import { addTage } from './datum.ts'

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
 * Tageswerte der letzten `tage` abgeschlossenen Tage (heute fehlt: dafür steht der Live-Wert).
 * Liquidität = Giro + Spar + Bargeld, dieselben Töpfe wie bei der Prognose; Vermögen = Nettovermögen
 * des Snapshots. Pro Tag der jüngste Snapshot, aufsteigend.
 */
export function tagesverlauf(snaps: SnapshotZeile[], heute: string, tage = 180): VerlaufPunkt[] {
  const ab = addTage(heute, -tage)
  const nachTag = new Map<string, SnapshotZeile>()
  for (const s of snaps) {
    const datum = s.snapshot_date.slice(0, 10)
    if (datum >= heute || datum < ab) continue
    nachTag.set(datum, s)
  }
  return [...nachTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([datum, s]) => ({
      datum,
      liquiditaet: Math.round((Number(s.total_checking) + Number(s.total_savings) + Number(s.total_cash)) * 100) / 100,
      vermoegen: Math.round(Number(s.net_worth) * 100) / 100,
    }))
}
