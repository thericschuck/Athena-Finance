import { addTage, tageZwischen } from '../forecast/datum.ts'

/**
 * Reine Logik der Dashboard-Liste „Als Nächstes": bekannte Zahlungstermine aus der Prognose und
 * auslaufende Kündigungsfristen zu EINER nach Datum sortierten Liste zusammenführen, Relativdatum
 * und Summe bilden. Keine Imports ausser dem Kalenderrechnen, damit `node --test` die Datei
 * direkt laden kann.
 *
 * Zeitzone: es werden nur Kalendertage `YYYY-MM-DD` verglichen, „heute" ist `kern.heute`
 * (deutsche Zeit). Nirgends `new Date()`, damit Server und Browser dasselbe rendern (Hydration).
 */

/** Standardfenster und die wählbaren Fenster (Tage ab heute). */
export const TERMINE_STANDARD_TAGE = 14
// 45 Tage, weil Kuendigungsfristen so weit voraus gemeldet werden (computeUpcomingRenewals).
export const TERMINE_FENSTER = [14, 30, 45] as const
/** So viele Zeilen sind sichtbar, der Rest steht hinter „Weitere (n)". */
export const TERMINE_MAX_SICHTBAR = 8

export type TerminArt = 'zahlung' | 'kuendigung'

export interface TerminZeile {
  /** Stabil und eindeutig (React-Key). */
  id: string
  /** YYYY-MM-DD */
  datum: string
  art: TerminArt
  name: string
  /** Betrag mit Vorzeichen (Ausgabe negativ); null bei Fristen. */
  betrag: number | null
  /** Tage ab heute (negativ = vorbei). */
  tage: number
  /** Nur bei Fristen: die Kündigungsfrist ist bereits verstrichen. */
  ueberfaellig: boolean
}

export interface TerminQuelle { datum: string; name: string; betrag: number }
export interface FristQuelle { id: string; name: string; days: number }

/**
 * Führt die Quellen zusammen. Zahlungen: nur `heute` bis `heute + tage`. Fristen: alles bis
 * `heute + tage`, auch Überfälliges (negative Tage) — das ist gerade das, was man nicht
 * übersehen soll. Sortierung: Datum, dann Zahlungen vor Fristen, dann Name.
 */
export function fuehreZusammen(
  heute: string, tage: number, termine: readonly TerminQuelle[], fristen: readonly FristQuelle[],
): TerminZeile[] {
  const bis = addTage(heute, tage)
  const zeilen: TerminZeile[] = []
  termine.forEach((t, i) => {
    if (t.datum < heute || t.datum > bis) return
    zeilen.push({
      id: `z-${t.datum}-${i}`, datum: t.datum, art: 'zahlung', name: t.name,
      betrag: t.betrag, tage: tageZwischen(heute, t.datum), ueberfaellig: false,
    })
  })
  for (const f of fristen) {
    if (f.days > tage) continue
    zeilen.push({
      id: `k-${f.id}`, datum: addTage(heute, f.days), art: 'kuendigung', name: f.name,
      betrag: null, tage: f.days, ueberfaellig: f.days < 0,
    })
  }
  return zeilen.sort((a, b) =>
    a.datum.localeCompare(b.datum)
    || (a.art === b.art ? 0 : a.art === 'zahlung' ? -1 : 1)
    || a.name.localeCompare(b.name, 'de'))
}

/** Die Zeilen, die in ein kleineres Fenster fallen (Umschalter 14/30, ohne neu zu laden). */
export function imFenster(zeilen: readonly TerminZeile[], tage: number): TerminZeile[] {
  return zeilen.filter(z => z.tage <= tage)
}

/** Relativdatum für eine Differenz in Tagen: „Heute", „Morgen", „in 5 Tagen", „vor 3 Tagen". */
export function relativDatum(tage: number): string {
  if (tage === 0) return 'Heute'
  if (tage === 1) return 'Morgen'
  if (tage === -1) return 'Gestern'
  return tage > 0 ? `in ${tage} Tagen` : `vor ${-tage} Tagen`
}

/**
 * Summe der Zahlungen im Fenster, getrennt nach Ausgaben (positiver Betrag) und Einnahmen.
 * Getrennt, weil „−1.240 € fällig" und „+3.000 € erwartet" verschiedene Aussagen sind und ein
 * Saldo beides verdecken würde. Fristen haben keinen Betrag und zählen nicht mit.
 */
export function summeFaellig(zeilen: readonly TerminZeile[]): { ausgaben: number; einnahmen: number } {
  let ausgaben = 0
  let einnahmen = 0
  for (const z of zeilen) {
    if (z.betrag === null) continue
    if (z.betrag < 0) ausgaben += -z.betrag
    else einnahmen += z.betrag
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return { ausgaben: r(ausgaben), einnahmen: r(einnahmen) }
}

/** `28.11.` bzw. `11/28` je nach Datumsformat der Einstellungen. */
export function kurzDatumTermin(iso: string, format = 'dd.MM.yyyy'): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  if (format === 'MM/dd/yyyy') return `${m}/${d}`
  if (format === 'yyyy-MM-dd') return `${m}-${d}`
  return `${d}.${m}.`
}
