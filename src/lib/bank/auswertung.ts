import type { BankTransaction } from '@/types/bank'
import type { BankSeitenDaten, BankScope, BankFlowZeile } from './typen.ts'
import { normIban } from './scope.ts'
import { sumFlows, savingsRate } from '../finance/flow-calc.ts'

/**
 * Reine Auswertungen fuer die Abschnitte Kennzahlen, Gegenparteien und Muster der
 * Bankdaten-Seite. Ohne React, damit sich die Regeln testen lassen (auswertung.test.ts).
 *
 * Gemeinsame Regel: Umbuchungen zwischen eigenen Konten gehoeren in keine Einnahmen-/
 * Ausgaben-Auswertung. Erkannt werden sie an der Gegen-IBAN (`counterpart_iban` ist eines
 * der eigenen Konten) — dieselbe Regel, mit der die Buchungsliste Umbuchungen markiert.
 */

export function istUmbuchung(t: BankTransaction, eigeneIbans: ReadonlySet<string>): boolean {
  return !!t.counterpart_iban && eigeneIbans.has(normIban(t.counterpart_iban))
}

/** Buchungen ohne Umbuchungen — Grundlage aller Einnahmen-/Ausgaben-Auswertungen hier. */
export function ohneUmbuchungen(buchungen: BankTransaction[], eigeneIbans: readonly string[]): BankTransaction[] {
  const set = new Set(eigeneIbans.map(normIban))
  return buchungen.filter(t => !istUmbuchung(t, set))
}

// ── Gegenpartei ──────────────────────────────────────────────────────────────

export const UNBEKANNT = 'Unbekannt'
const KURZTEXT_LAENGE = 40

const glatt = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Anzeigename der Gegenpartei: `counterpart_name`, sonst die ersten Zeichen des
 * Verwendungszwecks (viele Kartenzahlungen kommen ohne Namen), sonst „Unbekannt".
 * Nur Leerraum wird geglaettet; Gross-/Kleinschreibung bleibt, wie die Bank sie liefert.
 */
export function parteiName(t: Pick<BankTransaction, 'counterpart_name' | 'description'>): string {
  const name = glatt(t.counterpart_name ?? '')
  if (name) return name
  const text = glatt(t.description ?? '')
  if (text) return text.length > KURZTEXT_LAENGE ? `${text.slice(0, KURZTEXT_LAENGE).trimEnd()} …` : text
  return UNBEKANNT
}

/** Vergleichsschluessel: „REWE  Markt" und „Rewe Markt" sind dieselbe Partei. */
export const parteiSchluessel = (name: string) => glatt(name).toLowerCase()

export type Richtung = 'ausgaben' | 'einnahmen'

export interface ParteiZeile {
  name: string
  schluessel: string
  /** Betrag, immer positiv. */
  summe: number
  anzahl: number
  /** Anteil an der Gesamtsumme der Richtung, 0..1. */
  anteil: number
  schnitt: number
  /** Summe je Monat `YYYY-MM` (fuer den Mini-Verlauf). */
  monate: Record<string, number>
}

export interface ParteiAuswertung {
  zeilen: ParteiZeile[]
  weitere: { anzahlParteien: number; summe: number; anzahl: number; anteil: number } | null
  gesamt: number
  gesamtAnzahl: number
}

export function gegenparteien(
  buchungen: BankTransaction[],
  eigeneIbans: readonly string[],
  richtung: Richtung,
  topN = 10,
): ParteiAuswertung {
  const eigene = new Set(eigeneIbans.map(normIban))
  const nach = new Map<string, ParteiZeile & { namen: Map<string, number> }>()
  let gesamt = 0
  let gesamtAnzahl = 0

  for (const t of buchungen) {
    if (istUmbuchung(t, eigene)) continue
    const betrag = richtung === 'ausgaben' ? -t.amount : t.amount
    if (!(betrag > 0)) continue // falsches Vorzeichen oder 0
    const name = parteiName(t)
    const key = parteiSchluessel(name)
    let z = nach.get(key)
    if (!z) {
      z = { name, schluessel: key, summe: 0, anzahl: 0, anteil: 0, schnitt: 0, monate: {}, namen: new Map() }
      nach.set(key, z)
    }
    z.summe += betrag
    z.anzahl += 1
    z.namen.set(name, (z.namen.get(name) ?? 0) + 1)
    const monat = t.value_date.slice(0, 7)
    z.monate[monat] = (z.monate[monat] ?? 0) + betrag
    gesamt += betrag
    gesamtAnzahl += 1
  }

  const alle = [...nach.values()].map(z => {
    // Haeufigste Schreibweise als Anzeigename. Der Filter `partei` vergleicht ueber den
    // Schluessel, nicht ueber diese Schreibweise.
    const name = [...z.namen.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return {
      name, schluessel: z.schluessel, summe: z.summe, anzahl: z.anzahl, monate: z.monate,
      anteil: gesamt > 0 ? z.summe / gesamt : 0,
      schnitt: z.summe / z.anzahl,
    } satisfies ParteiZeile
  }).sort((a, b) => b.summe - a.summe)

  const zeilen = alle.slice(0, topN)
  const rest = alle.slice(topN)
  const weitere = rest.length === 0 ? null : {
    anzahlParteien: rest.length,
    summe: rest.reduce((s, z) => s + z.summe, 0),
    anzahl: rest.reduce((s, z) => s + z.anzahl, 0),
    anteil: gesamt > 0 ? rest.reduce((s, z) => s + z.summe, 0) / gesamt : 0,
  }
  return { zeilen, weitere, gesamt, gesamtAnzahl }
}

// ── Kennzahlen ───────────────────────────────────────────────────────────────

export interface Vorperiode {
  einnahmen: number
  ausgaben: number
  /** Der aktuelle Zeitraum enthaelt den laufenden (noch nicht abgeschlossenen) Monat. */
  laufenderMonat: boolean
}

export interface Kennzahlen {
  /** Summe der gebuchten Salden der (gewaehlten) Konten; null ohne Saldo. */
  saldo: number | null
  einnahmen: number
  ausgaben: number
  netto: number
  /** Prozent, nur Konsum (siehe flow-calc.savingsRate); null ohne Einnahmen. */
  sparquote: number | null
  ausgabenProTag: number | null
  tage: number
  groessteAusgabe: BankTransaction | null
  groessteEinnahme: BankTransaction | null
  /** Buchungen ohne Umbuchungen. */
  anzahl: number
  vorperiode: Vorperiode | null
}

const monatsStart = (ym: string) => `${ym}-01`

function monatPlus(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const tageZwischen = (von: string, bis: string) =>
  Math.round((Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10)) -
    Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10))) / 86_400_000) + 1

/**
 * Zahl der Tage, ueber die „pro Tag" gerechnet wird. Bei einem Monat: dessen Laenge, im
 * laufenden Monat nur bis heute. Sonst ab dem Cutoff bis heute; bei „Alles" ab der aeltesten
 * Buchung. Der Zeitraum endet immer heute: ein halber Monat soll den Schnitt nicht druecken.
 */
export function zeitraumTage(d: BankSeitenDaten, buchungen: BankTransaction[]): number {
  if (d.monat) {
    const ende = monatPlus(d.monat, 1)
    const letzter = tageZwischen(monatsStart(d.monat), monatsStart(ende)) - 1
    if (d.heute.slice(0, 7) === d.monat) return Number(d.heute.slice(8, 10))
    if (d.heute.slice(0, 7) < d.monat) return 0
    return letzter
  }
  // Die Ausgaben im Zaehler kommen aus den Flows, und die decken ab dem 1. des Cutoff-Monats
  // (Monatsebene, siehe scope.ts). Der Nenner muss denselben Anfang haben: mit dem Cutoff-TAG
  // (z. B. 23.07.) statt dem 1.7. waren es bei 3M rund 24 % zu hohe Ausgaben pro Tag.
  let von = d.cutoff ? `${d.cutoff.slice(0, 7)}-01` : null
  if (!von) {
    von = buchungen.reduce<string | null>((m, t) => (m === null || t.value_date < m ? t.value_date : m), null)
  }
  if (!von) return 0
  return Math.max(1, tageZwischen(von, d.heute))
}

/** Flow-Zeilen eines Monatsbereichs [vonYm, bisYm] fuer das gewaehlte Konto. */
function flowsImBereich(d: BankSeitenDaten, scope: BankScope, vonYm: string, bisYm: string): BankFlowZeile[] {
  return d.flowRows.filter(r => {
    const ym = r.month.slice(0, 7)
    if (ym < vonYm || ym > bisYm) return false
    if (d.konto && (scope.kontoAccountId === null || r.account_id !== scope.kontoAccountId)) return false
    return true
  })
}

/**
 * Vorperiode gleicher Laenge, auf Monatsebene (wie die Flows selbst):
 *  - Monat gewaehlt: der Monat davor.
 *  - Zeitraum mit Cutoff: die gleich vielen Monate vor dem Cutoff-Monat.
 *  - „Alles": keine Vorperiode.
 * `null`, wenn die Daten nicht so weit zurueckreichen — ein Vergleich gegen eine halbe
 * Vorperiode zeigte sonst einen Anstieg, der nur fehlende Daten ist.
 */
export function vorperiode(d: BankSeitenDaten, scope: BankScope): Vorperiode | null {
  const dieserMonat = d.heute.slice(0, 7)
  let aktVon: string
  let aktBis: string
  if (d.monat) { aktVon = d.monat; aktBis = d.monat }
  else if (d.cutoff) { aktVon = d.cutoff.slice(0, 7); aktBis = dieserMonat }
  else return null

  const n = tageMonate(aktVon, aktBis)
  const vorVon = monatPlus(aktVon, -n)
  const vorBis = monatPlus(aktVon, -1)

  const quelle = d.flowRows.filter(r =>
    !d.konto || (scope.kontoAccountId !== null && r.account_id === scope.kontoAccountId))
  const aeltester = quelle.reduce<string | null>((m, r) => (m === null || r.month < m ? r.month : m), null)
  if (aeltester === null || aeltester.slice(0, 7) > vorVon) return null

  const t = sumFlows(flowsImBereich(d, scope, vorVon, vorBis), d.include)
  return { einnahmen: t.income, ausgaben: t.expense, laufenderMonat: aktBis === dieserMonat }
}

function tageMonate(von: string, bis: string): number {
  return (Number(bis.slice(0, 4)) - Number(von.slice(0, 4))) * 12 + Number(bis.slice(5, 7)) - Number(von.slice(5, 7)) + 1
}

export function berechneKennzahlen(d: BankSeitenDaten, scope: BankScope): Kennzahlen {
  const echte = ohneUmbuchungen(scope.buchungen, d.eigeneIbans)

  const konten = d.konto ? d.balances.filter(b => normIban(b.account_iban) === normIban(d.konto!)) : d.balances
  const saldo = konten.length > 0 ? konten.reduce((s, b) => s + Number(b.booked_balance), 0) : null

  const totals = sumFlows(scope.flows, d.include)
  const tage = zeitraumTage(d, scope.buchungen)

  let groessteAusgabe: BankTransaction | null = null
  let groessteEinnahme: BankTransaction | null = null
  for (const t of echte) {
    if (t.amount < 0 && (groessteAusgabe === null || t.amount < groessteAusgabe.amount)) groessteAusgabe = t
    if (t.amount > 0 && (groessteEinnahme === null || t.amount > groessteEinnahme.amount)) groessteEinnahme = t
  }

  return {
    saldo,
    einnahmen: totals.income,
    ausgaben: totals.expense,
    netto: totals.net,
    sparquote: savingsRate(totals),
    ausgabenProTag: tage > 0 ? totals.expense / tage : null,
    tage,
    groessteAusgabe,
    groessteEinnahme,
    anzahl: echte.length,
    vorperiode: vorperiode(d, scope),
  }
}

/** Veraenderung in Prozent; null, wenn die Basis 0 ist (dann ist ein Prozentwert sinnlos). */
export function veraenderungProzent(aktuell: number, vorher: number): number | null {
  return vorher > 0 ? ((aktuell - vorher) / vorher) * 100 : null
}

// ── Muster ───────────────────────────────────────────────────────────────────

export const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const
/** Unter dieser Zahl Ausgabenbuchungen sagt eine Verteilung nichts aus. */
export const MUSTER_MIN_BUCHUNGEN = 30

export interface Muster {
  anzahl: number
  summe: number
  genug: boolean
  /** Montag = 0 … Sonntag = 6. */
  wochentagSumme: number[]
  wochentagAnzahl: number[]
  /** Index 0 = der 1. des Monats … 30 = der 31. */
  tagSumme: number[]
  tagAnzahl: number[]
  hinweise: string[]
}

export function berechneMuster(buchungen: BankTransaction[], eigeneIbans: readonly string[]): Muster {
  const eigene = new Set(eigeneIbans.map(normIban))
  const m: Muster = {
    anzahl: 0, summe: 0, genug: false,
    wochentagSumme: Array(7).fill(0), wochentagAnzahl: Array(7).fill(0),
    tagSumme: Array(31).fill(0), tagAnzahl: Array(31).fill(0),
    hinweise: [],
  }
  for (const t of buchungen) {
    if (t.amount >= 0 || istUmbuchung(t, eigene)) continue
    const betrag = -t.amount
    const [y, mo, tag] = t.value_date.slice(0, 10).split('-').map(Number)
    if (!y || !mo || !tag) continue
    const wt = (new Date(Date.UTC(y, mo - 1, tag)).getUTCDay() + 6) % 7
    m.wochentagSumme[wt] += betrag
    m.wochentagAnzahl[wt] += 1
    m.tagSumme[tag - 1] += betrag
    m.tagAnzahl[tag - 1] += 1
    m.summe += betrag
    m.anzahl += 1
  }
  m.genug = m.anzahl >= MUSTER_MIN_BUCHUNGEN
  if (!m.genug || m.summe <= 0) return m

  const anteil = (arr: number[], von: number, bis: number) =>
    arr.slice(von - 1, bis).reduce((s, v) => s + v, 0) / m.summe
  const pct = (x: number) => `${Math.round(x * 100)} %`

  const anfang = anteil(m.tagSumme, 1, 5)
  if (anfang > 0.5) m.hinweise.push(`Mehr als die Hälfte der Ausgaben (${pct(anfang)}) fällt auf den 1. bis 5. des Monats.`)
  const ende = anteil(m.tagSumme, 26, 31)
  if (ende > 0.4) m.hinweise.push(`${pct(ende)} der Ausgaben fallen auf den 26. bis Monatsende.`)

  // Wochentag: bei gleichmaessiger Verteilung waeren es 14 %; ab gut anderthalbfach lohnt ein Hinweis.
  const top = m.wochentagSumme.reduce((b, v, i) => (v > m.wochentagSumme[b] ? i : b), 0)
  const topAnteil = m.wochentagSumme[top] / m.summe
  if (topAnteil >= 0.25) m.hinweise.push(`${WOCHENTAGE[top]} ist mit ${pct(topAnteil)} der Ausgaben der stärkste Wochentag.`)
  const wochenende = (m.wochentagSumme[5] + m.wochentagSumme[6]) / m.summe
  if (wochenende >= 0.4) m.hinweise.push(`${pct(wochenende)} der Ausgaben fallen auf das Wochenende.`)
  return m
}
