/**
 * Verlauf der tatsächlichen Abbuchungen eines Vertrags: jeder Termin der letzten Monate wird mit den
 * Buchungen des Vertragskontos abgeglichen (gleiche Regeln wie `forecast/vertrag-abgleich.ts`: Ausgabe auf dem
 * Konto, Betrag innerhalb der Toleranz, Datum von 3 Tagen vor bis 7 Tagen nach dem Termin). Eine Buchung
 * zählt nur für einen Termin. Keine '@/'-Importe (node --test).
 */
import { addTage } from '../forecast/datum.ts'
import { termineImFenster } from '../forecast/termine.ts'
import { TAGE_NACH, TAGE_VOR } from '../forecast/vertrag-abgleich.ts'

export type VerlaufBuchung = {
  id: string
  account_id: string | null
  date: string
  /** Positiver Betrag. */
  amount: number
  type: string
  text: string
}

export type VerlaufVertrag = {
  amount: number
  frequency: string
  billing_day: number | null
  start_date: string
  end_date: string | null
  auto_renews: boolean
  is_active: boolean
  account_id: string | null
}

export type VerlaufZeile = {
  termin: string
  status: 'eingegangen' | 'erwartet' | 'offen'
  buchung: VerlaufBuchung | null
  /** Gebuchter Betrag minus Vertragsbetrag; null ohne Buchung. */
  abweichung: number | null
}

/** Dieselbe Toleranz wie der Abgleich: 5 %, mindestens 1 Euro. */
export const toleranz = (betrag: number) => Math.max(1, betrag * 0.05)

const abstand = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))

/** Die letzten `anzahl` Termine (neuester zuerst) mit der zugeordneten Buchung. */
export function abbuchungsVerlauf(v: VerlaufVertrag, buchungen: VerlaufBuchung[], heute: string, anzahl = 12): VerlaufZeile[] {
  if (!v.account_id) return []
  const termine = termineImFenster(v, addTage(heute, -800), heute).slice(-anzahl)
  const kandidaten = buchungen.filter(b => b.type === 'expense' && b.account_id === v.account_id)
  const benutzt = new Set<string>()
  const tol = toleranz(v.amount)

  const zeilen = termine.map((termin): VerlaufZeile => {
    const von = addTage(termin, -TAGE_VOR)
    const bis = addTage(termin, TAGE_NACH)
    const treffer = kandidaten
      .filter(b => !benutzt.has(b.id) && b.date >= von && b.date <= bis && Math.abs(b.amount - v.amount) <= tol)
      // Gleicher Datumsabstand (Amazon 8,99 und REWE 8,98 am selben Tag): die Buchung mit dem näheren Betrag
      // gewinnt, dann die ID — sonst entschied die zufällige Reihenfolge der Abfrage.
      .sort(
        (a, b) =>
          abstand(a.date, termin) - abstand(b.date, termin) ||
          Math.abs(a.amount - v.amount) - Math.abs(b.amount - v.amount) ||
          a.id.localeCompare(b.id),
      )[0]
    if (treffer) {
      benutzt.add(treffer.id)
      return { termin, status: 'eingegangen', buchung: treffer, abweichung: treffer.amount - v.amount }
    }
    return { termin, status: heute > bis ? 'offen' : 'erwartet', buchung: null, abweichung: null }
  })
  return zeilen.reverse()
}

export type VerlaufKennzahlen = {
  anzahlGebucht: number
  summeGebucht: number
  durchschnitt: number | null
  /** Letzter gebuchter Betrag, wenn er vom Vertragsbetrag abweicht (Preisänderung). */
  letzterBetrag: number | null
  /** Zeilen mit Status `offen`. */
  offen: number
}

export function verlaufKennzahlen(zeilen: VerlaufZeile[], vertragsBetrag: number): VerlaufKennzahlen {
  const gebucht = zeilen.flatMap(z => (z.buchung ? [z.buchung.amount] : []))
  const summe = gebucht.reduce((s, x) => s + x, 0)
  const letzter = zeilen.find(z => z.buchung)?.buchung?.amount ?? null
  return {
    anzahlGebucht: gebucht.length,
    summeGebucht: summe,
    durchschnitt: gebucht.length > 0 ? summe / gebucht.length : null,
    letzterBetrag: letzter !== null && Math.abs(letzter - vertragsBetrag) >= 0.005 ? letzter : null,
    offen: zeilen.filter(z => z.status === 'offen').length,
  }
}
