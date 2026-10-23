/**
 * Rechenlogik des Net-Worth-Tabs (analyse/verlauf): Aggregation, Deltas, Kennzahlen,
 * Datenlücken, Auffälligkeiten und Meilensteine.
 *
 * Rein und ohne Datenbankzugriff, damit sich die Regeln testen lassen. Alle Daten sind
 * Kalendertage als `YYYY-MM-DD`; gerechnet wird in UTC, damit die Zeitzone des Servers keinen
 * Tag verschiebt (`new Date('2026-04-01')` ist UTC-Mitternacht, lokale Getter könnten
 * den Vortag liefern).
 */
import type { NetWorthPunkt } from './types.ts'

export type Aggregation = 'tag' | 'woche' | 'monat'

export const AGGREGATIONEN: readonly { key: Aggregation; label: string }[] = [
  { key: 'tag', label: 'Täglich' },
  { key: 'woche', label: 'Wöchentlich' },
  { key: 'monat', label: 'Monatlich' },
]

// ─── Datums-Helfer (UTC) ──────────────────────────────────────────────────────

function tagZuMs(datum: string): number {
  return Date.parse(`${datum}T00:00:00Z`)
}

function msZuTag(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const TAG_MS = 86_400_000

export function tageDazwischen(von: string, bis: string): number {
  return Math.round((tagZuMs(bis) - tagZuMs(von)) / TAG_MS)
}

/** Datum um n Kalendertage verschieben. */
export function addTage(datum: string, n: number): string {
  return msZuTag(tagZuMs(datum) + n * TAG_MS)
}

/**
 * Datum um n Monate verschieben. Der Tag wird auf das Monatsende gekappt (31.03. − 1 Monat
 * = 28.02.), sonst würde `Date` in den Folgemonat überlaufen.
 */
export function addMonate(datum: string, n: number): string {
  const [j, m, t] = datum.split('-').map(Number)
  const ziel = new Date(Date.UTC(j, m - 1 + n, 1))
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate()
  ziel.setUTCDate(Math.min(t, letzter))
  return ziel.toISOString().slice(0, 10)
}

/** Montag der ISO-Woche, in der `datum` liegt. */
export function wochenStart(datum: string): string {
  const wt = new Date(`${datum}T00:00:00Z`).getUTCDay() // 0 = Sonntag
  return addTage(datum, -((wt + 6) % 7))
}

/** Periodenschlüssel: Tag = Datum, Woche = Montag der ISO-Woche, Monat = YYYY-MM. */
export function periodenSchluessel(datum: string, modus: Aggregation): string {
  if (modus === 'tag') return datum
  if (modus === 'woche') return wochenStart(datum)
  return datum.slice(0, 7)
}

// ─── Aggregation und Delta ────────────────────────────────────────────────────

/**
 * Letzter Snapshot je Periode (Net Worth ist ein Bestand, kein Fluss: der Stand am Ende der
 * Woche/des Monats ist der Wert der Periode, nicht Summe oder Mittel). Eingabe beliebig
 * sortiert, Ausgabe aufsteigend. Generisch, damit Zeilen mit `id`/`source` erhalten bleiben.
 */
export function aggregiere<T extends { datum: string }>(punkte: T[], modus: Aggregation): T[] {
  const sortiert = [...punkte].sort((a, b) => a.datum.localeCompare(b.datum))
  if (modus === 'tag') return sortiert
  const je = new Map<string, T>()
  // Aufsteigend durchlaufen: spätere Snapshots überschreiben frühere derselben Periode.
  for (const p of sortiert) je.set(periodenSchluessel(p.datum, modus), p)
  return [...je.values()]
}

export type MitDelta<T> = T & {
  /** Änderung des Net Worth zum vorherigen Eintrag der (aggregierten) Liste; null beim ersten. */
  delta: number | null
  /** Dieselbe Änderung in Prozent des vorherigen Werts; null, wenn dieser 0 ist. */
  deltaProzent: number | null
}

/** Δ € und Δ % zum jeweils vorherigen Eintrag. Erwartet aufsteigende Eingabe. */
export function mitDelta<T extends { net_worth: number }>(aufsteigend: T[]): MitDelta<T>[] {
  return aufsteigend.map((p, i) => {
    if (i === 0) return { ...p, delta: null, deltaProzent: null }
    const vor = aufsteigend[i - 1].net_worth
    const delta = p.net_worth - vor
    return { ...p, delta, deltaProzent: prozent(delta, vor) }
  })
}

/** Prozent bezogen auf den Betrag der Basis (bei negativem Net Worth bleibt das Vorzeichen sinnvoll). */
function prozent(delta: number, basis: number): number | null {
  if (!Number.isFinite(basis) || basis === 0) return null
  return (delta / Math.abs(basis)) * 100
}

// ─── Kennzahlen ───────────────────────────────────────────────────────────────

export interface DeltaZumStichtag {
  betrag: number
  prozent: number | null
  /** Datum des Referenz-Snapshots (jüngster Snapshot <= Stichtag). */
  referenz: string
}

export interface Kennzahlen {
  aktuell: NetWorthPunkt | null
  monat1: DeltaZumStichtag | null
  monate3: DeltaZumStichtag | null
  monate12: DeltaZumStichtag | null
  ytd: DeltaZumStichtag | null
  hoch: { datum: string; wert: number } | null
  /** Abstand zum Allzeithoch: <= 0. Beim Hoch selbst 0. */
  abstandHoch: { betrag: number; prozent: number | null } | null
  schulden: number | null
}

/** Jüngster Snapshot mit datum <= stichtag (Eingabe aufsteigend). */
function referenzBis(aufsteigend: NetWorthPunkt[], stichtag: string): NetWorthPunkt | null {
  let treffer: NetWorthPunkt | null = null
  for (const p of aufsteigend) {
    if (p.datum <= stichtag) treffer = p
    else break
  }
  return treffer
}

/**
 * Net Worth heute samt Änderungen zu 1/3/12 Monaten und seit Jahresanfang, Allzeithoch und
 * Schulden. „Heute" ist der jüngste Snapshot (nicht der Kalendertag), damit die Kachel auch
 * dann stimmt, wenn der heutige Snapshot noch fehlt. Fehlt für einen Stichtag ein Snapshot
 * davor (Historie beginnt später), ist die Kennzahl null statt mit dem ersten Snapshot
 * geschönt zu werden.
 *
 * `ytd`: Referenz ist der letzte Snapshot VOR dem 1. Januar (Stand zum Jahreswechsel).
 */
export function kennzahlen(punkte: NetWorthPunkt[], heute: string): Kennzahlen {
  const asc = [...punkte].sort((a, b) => a.datum.localeCompare(b.datum))
  const aktuell = asc.length ? asc[asc.length - 1] : null
  if (!aktuell) {
    return { aktuell: null, monat1: null, monate3: null, monate12: null, ytd: null, hoch: null, abstandHoch: null, schulden: null }
  }

  const gegen = (stichtag: string): DeltaZumStichtag | null => {
    const ref = referenzBis(asc, stichtag)
    if (!ref || ref.datum === aktuell.datum) return null
    const betrag = aktuell.net_worth - ref.net_worth
    return { betrag, prozent: prozent(betrag, ref.net_worth), referenz: ref.datum }
  }

  let hoch = asc[0]
  for (const p of asc) if (p.net_worth > hoch.net_worth) hoch = p
  const abstand = aktuell.net_worth - hoch.net_worth

  const jahresanfang = `${heute.slice(0, 4)}-01-01`

  return {
    aktuell,
    monat1: gegen(addMonate(heute, -1)),
    monate3: gegen(addMonate(heute, -3)),
    monate12: gegen(addMonate(heute, -12)),
    ytd: gegen(addTage(jahresanfang, -1)),
    hoch: { datum: hoch.datum, wert: hoch.net_worth },
    abstandHoch: { betrag: abstand, prozent: prozent(abstand, hoch.net_worth) },
    schulden: aktuell.total_debts,
  }
}

// ─── Datenqualität ────────────────────────────────────────────────────────────

export interface Luecke {
  /** Erster fehlender Tag. */
  von: string
  /** Letzter fehlender Tag. */
  bis: string
  tage: number
}

/** Fehlende Tage zwischen aufeinanderfolgenden Snapshots, als zusammenhängende Bereiche. */
export function luecken(punkte: { datum: string }[]): Luecke[] {
  const tage = [...new Set(punkte.map(p => p.datum))].sort()
  const out: Luecke[] = []
  for (let i = 1; i < tage.length; i++) {
    const fehlend = tageDazwischen(tage[i - 1], tage[i]) - 1
    if (fehlend > 0) out.push({ von: addTage(tage[i - 1], 1), bis: addTage(tage[i], -1), tage: fehlend })
  }
  return out
}

export const SPRUNG_SCHWELLE = 0.3

export interface Auffaelligkeit {
  datum: string
  grund: 'null' | 'sprung'
  /** Änderung zum Vortag in Prozent (nur bei `sprung`). */
  prozent: number | null
}

/**
 * Snapshots, die nach Fehlern aussehen: Net Worth genau 0 (Snapshot lief ohne Salden) oder
 * Sprung > 30 % zum vorherigen Snapshot. Verglichen wird mit dem vorherigen vorhandenen
 * Snapshot, nicht nur mit dem Vortag, sonst würde jede Lücke den Folgetag verschleiern.
 * Die Rückkehr nach einem Ausreißer (Sprung zurück) wird ebenfalls markiert — das ist
 * gewollt: beide Kanten gehören zum selben Fehler und lassen sich so finden.
 */
export function auffaelligkeiten(punkte: NetWorthPunkt[]): Auffaelligkeit[] {
  const asc = [...punkte].sort((a, b) => a.datum.localeCompare(b.datum))
  const out: Auffaelligkeit[] = []
  asc.forEach((p, i) => {
    if (p.net_worth === 0) {
      out.push({ datum: p.datum, grund: 'null', prozent: null })
      return
    }
    if (i === 0) return
    const vor = asc[i - 1].net_worth
    if (vor === 0) return
    const rel = (p.net_worth - vor) / Math.abs(vor)
    if (Math.abs(rel) > SPRUNG_SCHWELLE) out.push({ datum: p.datum, grund: 'sprung', prozent: rel * 100 })
  })
  return out
}

// ─── Projektion und Meilensteine ──────────────────────────────────────────────

// Die Prognose selbst kommt aus lib/forecast (Zyklusmodell, Vertraege, Termine, 80-%-Bereich):
// sie ist genauer als eine Gerade aus der Sparrate und wird ueber lib/verlauf/prognose-linie
// in eine Chart-Linie uebersetzt. Hier bleiben nur die Meilensteine.

/** Runde Schwellen 1 / 2,5 / 5 × 10^k, ab 1.000 €. */
function schwellen(): number[] {
  const out: number[] = []
  for (let k = 3; k <= 10; k++) for (const f of [1, 2.5, 5]) out.push(f * 10 ** k)
  return out
}

/** Die nächsten (max. 2) runden Schwellen über dem Stand — Ziele für Chart-Referenzlinien. */
export function meilensteine(nw: number): number[] {
  const basis = Math.max(nw, 0)
  return schwellen().filter(s => s > basis).slice(0, 2)
}
