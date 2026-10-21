import { addMonate, median, monatVon, parse } from './datum.ts'
import type { HistorieMonat } from './cashflow.ts'

/**
 * Baut aus den Monatssummen (`monthly_flows`) die Historie, auf der die Prognose aufsetzt.
 *
 *   - Nur ABGESCHLOSSENE Monate: der laufende ist per Definition unvollständig und würde die
 *     Basis nach unten ziehen.
 *   - Monate ohne jede Buchung zwischen dem ersten und dem letzten Monat mit Daten zählen als 0
 *     (ein Monat ohne Buchungen ist eine Aussage); davor und danach gibt es keine Monate.
 *   - Lohn ist der Teil der Einnahmen mit Steuerrolle `lohn`.
 *
 * Keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt laden kann.
 */

export type FlowZeile = {
  /** Erster Tag des Monats, `YYYY-MM-DD`. */
  month: string
  flow_kind: string
  income: number
  expense: number
  tax_role: string | null
}

export function baueHistorie(zeilen: FlowZeile[], heute: string, maxMonate = 12): HistorieMonat[] {
  const aktuell = monatVon(heute)
  const proMonat = new Map<string, HistorieMonat>()

  for (const z of zeilen) {
    const monat = monatVon(z.month)
    if (monat >= aktuell) continue
    if (z.flow_kind !== 'echt' && z.flow_kind !== 'anlage' && z.flow_kind !== 'forderung') continue
    const m = proMonat.get(monat) ?? {
      month: monat, einnahmen: 0, ausgaben: 0, einnahmenEcht: 0, ausgabenEcht: 0, lohnNetto: 0,
    }
    m.einnahmen += z.income
    m.ausgaben += z.expense
    if (z.flow_kind === 'echt') {
      m.einnahmenEcht += z.income
      m.ausgabenEcht += z.expense
      if (z.tax_role === 'lohn') m.lohnNetto += z.income
    }
    proMonat.set(monat, m)
  }

  const monate = [...proMonat.keys()].sort()
  if (monate.length === 0) return []

  const ergebnis: HistorieMonat[] = []
  let monat = monate[0]
  const letzter = monate[monate.length - 1]
  for (let i = 0; monat <= letzter && i < 240; i++, monat = addMonate(monat, 1)) {
    const m = proMonat.get(monat) ?? {
      month: monat, einnahmen: 0, ausgaben: 0, einnahmenEcht: 0, ausgabenEcht: 0, lohnNetto: 0,
    }
    ergebnis.push(m)
  }
  return ergebnis.slice(-maxMonate)
}

/** Typischer Tag des Lohneingangs (Median der Tage im Monat); null ohne Daten. */
export function typischerLohnTag(daten: string[]): number | null {
  if (daten.length === 0) return null
  return Math.round(median(daten.map(d => parse(d).d)))
}
