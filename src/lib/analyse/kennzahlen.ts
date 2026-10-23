import { sumFlows, savingsRate } from '../finance/flow-calc.ts'
import type { FlowInclude } from '../finance/flow-calc.ts'
import { imFenster } from './vergleich.ts'
import type { Fenster } from './vergleich.ts'

/**
 * Reine Rechenlogik der Kennzahlen-Kacheln der Analyse-Seite. Ohne React und ohne Datenbank,
 * damit sich die Regeln testen lassen (kennzahlen.test.ts).
 *
 * Grundregel: Zaehler und Nenner decken denselben Zeitraum ab. Die Summen kommen aus den
 * Monatssummen (`monthly_flows`) und gelten damit ab dem 1. des Cutoff-Monats; „pro Tag" teilt
 * deshalb durch die Tage ab dem 1. dieses Monats bis heute, nicht ab dem Cutoff-TAG (siehe die
 * Lehre aus lib/bank/auswertung.ts: mit dem Cutoff-Tag waren die Ausgaben pro Tag bei 3M rund 24 %
 * zu hoch).
 */

/** Soviel von einer Monatszeile (`monthly_flows`), wie die Kennzahlen brauchen. */
export interface MonatsZeile {
  month: string
  flow_kind: string
  income: number
  expense: number
  tx_count: number
}

/** Soviel von einer Einzelbuchung (`unified_transactions`), wie die Kennzahlen brauchen. */
export interface Buchung {
  date: string
  type: 'income' | 'expense'
  /** Betrag, immer positiv. */
  amount: number
  flow_kind: string
}

export interface Summen {
  einnahmen: number
  ausgaben: number
  netto: number
  /** Prozent, nur Konsum (flow-calc.savingsRate); null ohne Einnahmen. */
  sparquote: number | null
  anzahl: number
  /** Tage, ueber die „pro Tag" gerechnet wurde (0 = nicht berechenbar). */
  tage: number
  ausgabenProTag: number | null
}

const tagMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

/** Tage von `von` bis `bis`, beide inklusive (YYYY-MM-DD). */
export function tageZwischen(von: string, bis: string): number {
  return Math.round((tagMs(bis) - tagMs(von)) / 86_400_000) + 1
}

/** Tage eines Monats (`YYYY-MM` oder `YYYY-MM-DD`). */
export function tageImMonat(monat: string): number {
  return new Date(Date.UTC(+monat.slice(0, 4), +monat.slice(5, 7), 0)).getUTCDate()
}

/** Tage eines Monatsfensters: von dessen Erstem bis zum Ende des letzten Monats (ganze Monate). */
export function tageImFenster(f: Fenster): number {
  const ende = `${f.bis.slice(0, 7)}-${String(tageImMonat(f.bis)).padStart(2, '0')}`
  return tageZwischen(`${f.von.slice(0, 7)}-01`, ende)
}

function baue(
  einnahmen: number, ausgaben: number, sparquote: number | null, anzahl: number, tage: number,
): Summen {
  return {
    einnahmen, ausgaben, netto: einnahmen - ausgaben, sparquote, anzahl, tage,
    ausgabenProTag: tage > 0 ? ausgaben / tage : null,
  }
}

/**
 * Summen eines Monatsfensters aus den Monatssummen. `tage` ist der Nenner fuer „pro Tag" und
 * muss dasselbe Fenster abdecken wie die Zeilen (siehe `tageZwischen` / `tageImFenster`).
 */
export function summenAusMonaten(zeilen: readonly MonatsZeile[], include: FlowInclude, f: Fenster, tage: number): Summen {
  const imBereich = zeilen.filter(z => imFenster(z.month, f))
  const t = sumFlows(imBereich, include)
  const gezaehlt = imBereich.reduce((s, z) => (
    // Nur Arten zaehlen, die in dieser Sicht mitrechnen (wie sumFlows).
    z.flow_kind === 'echt' || (z.flow_kind === 'anlage' && include.anlage) || (z.flow_kind === 'forderung' && include.forderung)
      ? s + (Number(z.tx_count) || 0) : s
  ), 0)
  return baue(t.income, t.expense, savingsRate(t), gezaehlt, tage)
}

/**
 * Summen ueber ALLE Einzelbuchungen (Zeitraum „Alles"): die Monatssummen der Seite reichen nur
 * ~24 Monate zurueck, die Buchungen dagegen so weit wie die Historie. „pro Tag" laeuft ab der
 * aeltesten Buchung bis heute.
 */
export function summenAusBuchungen(buchungen: readonly Buchung[], include: FlowInclude, heute: string): Summen {
  const zeilen = buchungen.map(b => ({
    flow_kind: b.flow_kind,
    income: b.type === 'income' ? b.amount : 0,
    expense: b.type === 'expense' ? b.amount : 0,
  }))
  const t = sumFlows(zeilen, include)
  const gezaehlt = buchungen.filter(b =>
    b.flow_kind === 'echt' || (b.flow_kind === 'anlage' && include.anlage) || (b.flow_kind === 'forderung' && include.forderung),
  )
  let aeltestes: string | null = null
  for (const b of gezaehlt) if (aeltestes === null || b.date < aeltestes) aeltestes = b.date
  const tage = aeltestes ? Math.max(1, tageZwischen(aeltestes, heute)) : 0
  return baue(t.income, t.expense, savingsRate(t), gezaehlt.length, tage)
}

/** Groesste Einzelbuchung einer Art (bei Gleichstand die aelteste); null, wenn es keine gibt. */
export function groessteBuchung<T extends Buchung>(buchungen: readonly T[], art: 'income' | 'expense'): T | null {
  let best: T | null = null
  for (const b of buchungen) {
    if (b.type !== art || !(b.amount > 0)) continue
    if (best === null || b.amount > best.amount) best = b
  }
  return best
}

/** Veraenderung in Prozent; null, wenn die Basis 0 ist (dann ist ein Prozentwert sinnlos). */
export function veraenderungProzent(aktuell: number, vorher: number): number | null {
  return vorher > 0 ? ((aktuell - vorher) / vorher) * 100 : null
}

/** Veraenderung in Prozentpunkten (Sparquote); null, wenn eine der Quoten fehlt. */
export function veraenderungPunkte(aktuell: number | null, vorher: number | null): number | null {
  return aktuell === null || vorher === null ? null : aktuell - vorher
}

export type Ton = 'gut' | 'schlecht' | 'neutral'

/**
 * Wie ein Anstieg gefaerbt wird: `steigtIstGut` bei Einnahmen/Saldo/Sparquote, sonst Anstieg =
 * schlecht (Ausgaben). Gerundet 0 gilt als unveraendert. Farbe ist nie das einzige Signal: die
 * Anzeige haengt immer Pfeil und Zahl dazu.
 */
export function tonFuer(wert: number, steigtIstGut: boolean): Ton {
  const rund = Math.round(wert)
  if (rund === 0) return 'neutral'
  return (rund > 0) === steigtIstGut ? 'gut' : 'schlecht'
}
