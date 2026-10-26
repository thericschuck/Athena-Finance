import { addTage } from './datum.ts'
import { termineImFenster, type TerminVertrag } from './termine.ts'

/**
 * Vertrags-Abgleich: Verträge und Abos sind nur eine Übersicht. Sie legen keine Buchungen an, sondern
 * prüfen, ob zum letzten Abbuchungstermin eine passende Buchung auf dem Konto eingegangen ist.
 *
 * Passend heißt: Ausgabe auf dem Vertragskonto, Betrag innerhalb der Toleranz, Datum im Fenster um den
 * Termin. Die Bank bucht oft einige Tage später (Wochenende, Auslandszahlung), deshalb gilt ein Termin
 * erst nach der Karenzzeit als „offen"; davor ist er nur „erwartet".
 *
 * Keine Imports außer Typen und Datumshelfer, damit `node --test` die Datei direkt lädt.
 */

export type AbgleichVertrag = TerminVertrag & {
  id: string
  name: string
  type: string
  amount: number
  account_id: string | null
}

export type AbgleichBuchung = {
  id: string
  account_id: string | null
  /** `YYYY-MM-DD` */
  date: string
  /** Betrag als positive Zahl in der Vertragswährung (EUR). */
  amount: number
  /** Nur Ausgaben zählen; Umbuchungen und Einnahmen nie. */
  type: string
}

export type AbgleichStatus = 'eingegangen' | 'erwartet' | 'offen'

export type Abgleich = {
  status: AbgleichStatus
  /** Der geprüfte Abbuchungstermin. */
  termin: string
  /** Datum der gefundenen Buchung, nur bei `eingegangen`. */
  buchungDatum: string | null
  buchungId: string | null
}

/** Tage vor dem Termin, ab denen eine Buchung noch zum Termin zählt (Vorabbuchung). */
export const TAGE_VOR = 3
/** Tage nach dem Termin, bis zu denen die Bank noch nachbuchen darf. */
export const TAGE_NACH = 7
/** Wie weit zurück der letzte Termin höchstens liegen darf, um noch geprüft zu werden. */
export const FENSTER_TAGE = 45

/** Verträge mit Umbuchungs-Charakter (Sparrate, Bausparen) laufen zwischen eigenen Konten und werden nicht geprüft. */
const UEBERSPRUNGEN = new Set(['transfer', 'savings_plan', 'building_savings'])

const toleranz = (betrag: number) => Math.max(1, betrag * 0.05)

/**
 * Der Termin, der geprüft wird: der jüngste Termin, der nicht in der Zukunft liegt. `null`, wenn der
 * Vertrag nicht geprüft werden kann (inaktiv, ohne Konto, Umbuchung, noch kein Termin im Fenster).
 */
export function pruefTermin(v: AbgleichVertrag, heute: string): string | null {
  if (!v.is_active || !v.account_id || UEBERSPRUNGEN.has(v.type)) return null
  const termine = termineImFenster(v, addTage(heute, -FENSTER_TAGE), heute)
  return termine.length > 0 ? termine[termine.length - 1] : null
}

export function pruefeVertrag(v: AbgleichVertrag, buchungen: AbgleichBuchung[], heute: string): Abgleich | null {
  const termin = pruefTermin(v, heute)
  if (!termin) return null

  const von = addTage(termin, -TAGE_VOR)
  const bis = addTage(termin, TAGE_NACH)
  const tol = toleranz(v.amount)

  const treffer = buchungen
    .filter(b =>
      b.type === 'expense' && b.account_id === v.account_id &&
      b.date >= von && b.date <= bis && Math.abs(b.amount - v.amount) <= tol)
    // Bei mehreren Kandidaten gewinnt die dem Termin nächste Buchung.
    .sort((a, b) => abstand(a.date, termin) - abstand(b.date, termin))[0]

  if (treffer) return { status: 'eingegangen', termin, buchungDatum: treffer.date, buchungId: treffer.id }
  return { status: heute > bis ? 'offen' : 'erwartet', termin, buchungDatum: null, buchungId: null }
}

function abstand(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
}
