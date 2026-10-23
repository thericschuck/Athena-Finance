/**
 * Rechenregeln der Dashboard-Kennzahlenleiste (components/dashboard/DashKennzahlen.tsx).
 *
 * Rein und ohne Datenbankzugriff, damit sich die Regeln testen lassen. Alle Daten sind
 * Kalendertage als `YYYY-MM-DD`; gerechnet wird in UTC (siehe lib/verlauf/networth.ts).
 */
import { addTage, tageDazwischen } from '../verlauf/networth.ts'

/** Konten, die zur Liquidität zählen — dieselben Typen wie in lib/forecast/laden.ts. */
export const LIQUIDE_TYPEN: ReadonlySet<string> = new Set(['checking', 'savings', 'cash'])

/** Liquidität heute: Summe der Salden aller Konten vom Typ Giro, Spar oder Bargeld. */
export function liquiditaetIst(konten: readonly { type: string; saldo: number }[]): number {
  return konten.reduce((s, k) => (LIQUIDE_TYPEN.has(k.type) ? s + k.saldo : s), 0)
}

export interface VeraenderungZumStichtag {
  betrag: number
  /** In Prozent des Ausgangswerts; null, wenn dieser 0 ist. */
  prozent: number | null
  /** Datum des Referenz-Snapshots. */
  referenz: string
}

/**
 * Veränderung des Net Worth gegenüber dem jüngsten Snapshot am oder vor `heute - tage`.
 *
 * Fehlt ein solcher Snapshot oder liegt er mehr als `toleranz` Tage vor dem Stichtag (Historie
 * beginnt später, große Lücke), ist das Ergebnis null: lieber kein Delta als ein Delta über einen
 * ganz anderen Zeitraum. Der „aktuelle" Wert ist der letzte Snapshot (Live-Stand von heute).
 */
export function veraenderungNachTagen(
  punkte: readonly { datum: string; net_worth: number }[],
  heute: string,
  tage: number,
  toleranz = 7,
): VeraenderungZumStichtag | null {
  if (punkte.length < 2) return null
  const asc = [...punkte].sort((a, b) => a.datum.localeCompare(b.datum))
  const aktuell = asc[asc.length - 1]
  const stichtag = addTage(heute, -tage)
  let ref: { datum: string; net_worth: number } | null = null
  for (const p of asc) {
    if (p.datum <= stichtag) ref = p
    else break
  }
  if (!ref || ref.datum === aktuell.datum) return null
  if (tageDazwischen(ref.datum, stichtag) > toleranz) return null
  const betrag = aktuell.net_worth - ref.net_worth
  const prozent = ref.net_worth === 0 ? null : (betrag / Math.abs(ref.net_worth)) * 100
  return { betrag, prozent, referenz: ref.datum }
}

export interface LiquiditaetAusblick {
  /** Erwartete Liquidität am Zieltag und 80-%-Bereich. */
  wert: number
  unten: number
  oben: number
  datum: string
}

/**
 * Erwartete Liquidität in `tage` Tagen aus den Prognose-Tageswerten: der letzte Tag bis zum Ziel.
 * Reicht die Prognose nicht so weit, null (kein erfundener Wert).
 */
export function liquiditaetIn(
  prognoseTage: readonly { datum: string; liquiditaet: number; liquiditaetUnten: number; liquiditaetOben: number }[],
  heute: string,
  tage = 30,
): LiquiditaetAusblick | null {
  const ziel = addTage(heute, tage)
  let treffer: (typeof prognoseTage)[number] | null = null
  for (const t of prognoseTage) {
    if (t.datum <= ziel) treffer = t
    else break
  }
  if (!treffer || tageDazwischen(treffer.datum, ziel) > 3) return null
  return { wert: treffer.liquiditaet, unten: treffer.liquiditaetUnten, oben: treffer.liquiditaetOben, datum: treffer.datum }
}

export interface NaechsterTermin {
  name: string
  /** Vorzeichen wie in der Prognose: negativ = Abfluss. null bei Kündigungsfristen. */
  betrag: number | null
  datum: string
  tage: number
  art: 'zahlung' | 'kuendigung'
}

/**
 * Der nächste Termin: die früheste bekannte Zahlung ab heute (aus der Prognose); gibt es keine
 * Prognose, die früheste ablaufende Kündigungsfrist (`tage` < 0 heißt überfällig).
 */
export function naechsterTermin(
  termine: readonly { datum: string; name: string; betrag: number }[] | null,
  kuendbar: readonly { name: string; days: number }[],
  heute: string,
): NaechsterTermin | null {
  // Das FRUEHERE von beiden: eine Zahlung in 40 Tagen ist nicht der „naechste" Termin, wenn in
  // 5 Tagen eine Kuendigungsfrist ablaeuft. Bei Gleichstand gewinnt die Zahlung.
  const t = termine
    ? [...termine].filter(x => x.datum >= heute).sort((a, b) => a.datum.localeCompare(b.datum))[0]
    : undefined
  const zahlung: NaechsterTermin | null = t
    ? { name: t.name, betrag: t.betrag, datum: t.datum, tage: tageDazwischen(heute, t.datum), art: 'zahlung' }
    : null
  const k = [...kuendbar].sort((a, b) => a.days - b.days)[0]
  const frist: NaechsterTermin | null = k
    ? { name: k.name, betrag: null, datum: addTage(heute, k.days), tage: k.days, art: 'kuendigung' }
    : null
  if (zahlung && frist) return frist.tage < zahlung.tage ? frist : zahlung
  return zahlung ?? frist
}
