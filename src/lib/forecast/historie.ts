import { median, parse } from './datum.ts'
import type { TagesSumme } from './zyklus.ts'

/**
 * Aufbereitung der Historie für die Prognose: aus den Einzelbuchungen werden Tagessummen. Das
 * Zyklusmodell (zyklus.ts) lernt aus dieser ganzen Historie, nicht aus einem Ausschnitt.
 *
 * Keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt laden kann.
 */

export type FlussBuchung = {
  /** Buchungs-ID; nötig, damit einzelne Posten ausgeschlossen werden können. */
  id?: string
  /** `YYYY-MM-DD` */
  date: string
  type: 'income' | 'expense'
  /** Betrag in EUR, positiv. */
  amount: number
  flow_kind: string
  /** Vererbte Steuerrolle der Kategorie, null = keine. */
  tax_role: string | null
}

/**
 * Tagessummen aus Buchungen, die als Einnahme/Ausgabe zählen (echt, anlage, forderung). Tage ohne
 * Buchung fehlen — das Modell füllt sie mit 0 auf. Lohn ist der Teil der `echt`-Einnahmen mit
 * Steuerrolle `lohn` und wird getrennt modelliert. Aufsteigend nach Datum.
 *
 * `ausschluss`: IDs von Buchungen, die das Modell nicht lernen soll (Einmalposten, siehe einmalig.ts).
 */
export function baueTage(buchungen: FlussBuchung[], ausschluss?: Set<string>): TagesSumme[] {
  const nachTag = new Map<string, TagesSumme>()
  for (const b of buchungen) {
    if (ausschluss && b.id && ausschluss.has(b.id)) continue
    if (b.flow_kind !== 'echt' && b.flow_kind !== 'anlage' && b.flow_kind !== 'forderung') continue
    const datum = b.date.slice(0, 10)
    const t = nachTag.get(datum) ?? { datum, einnahmen: 0, ausgaben: 0, einnahmenEcht: 0, ausgabenEcht: 0, lohn: 0 }
    const echt = b.flow_kind === 'echt'
    if (b.type === 'income') {
      t.einnahmen += b.amount
      if (echt) {
        t.einnahmenEcht += b.amount
        if (b.tax_role === 'lohn') t.lohn += b.amount
      }
    } else {
      t.ausgaben += b.amount
      if (echt) t.ausgabenEcht += b.amount
    }
    nachTag.set(datum, t)
  }
  return [...nachTag.values()].sort((a, b) => a.datum.localeCompare(b.datum))
}

/** Typischer Tag des Lohneingangs (Median der Tage im Monat); null ohne Daten. */
export function typischerLohnTag(daten: string[]): number | null {
  if (daten.length === 0) return null
  return Math.round(median(daten.map(d => parse(d).d)))
}
