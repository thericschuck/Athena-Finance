/**
 * Filter der Transaktionen-Seite: aus der Adresszeile lesen, prüfen, in Zeiträume übersetzen.
 * Rein und ohne Imports — Seite, Export-Route und Filterleiste teilen sich dieselben Regeln, damit
 * „was die Liste zeigt“ und „was der Export schreibt“ nie auseinanderlaufen.
 *
 * Alles aus der Adresszeile ist unvertrauenswürdig: Typen, Arten und Sortierungen sind feste Listen,
 * IDs müssen UUIDs sein, Daten ISO-Daten, Beträge endliche Zahlen. Was nicht passt, fällt weg.
 */

export const TYPEN = ['income', 'expense', 'transfer'] as const
export type Typ = (typeof TYPEN)[number]

/**
 * Buchungsart (`flow_kind` in unified_transactions). Das ist NICHT der Typ: „Investition“ war einmal
 * ein Typ-Filter, den es in den Daten nie gab (Anlagen sind eine Art, kein Typ) und der deshalb nie
 * etwas fand.
 */
export const ARTEN = ['echt', 'anlage', 'forderung', 'umbuchung', 'anfangsbestand'] as const
export type Art = (typeof ARTEN)[number]

export const ART_LABEL: Record<Art, string> = {
  echt: 'Regulär',
  anlage: 'Anlage',
  forderung: 'Forderung',
  umbuchung: 'Umbuchung',
  anfangsbestand: 'Anfangsbestand',
}

export const TYP_LABEL: Record<Typ, string> = {
  income: 'Einnahme',
  expense: 'Ausgabe',
  transfer: 'Umbuchung',
}

export const SORTIERUNGEN = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc'] as const
export type Sortierung = (typeof SORTIERUNGEN)[number]

export const SORT_LABEL: Record<Sortierung, string> = {
  'date-desc': 'Neueste zuerst',
  'date-asc': 'Älteste zuerst',
  'amount-desc': 'Größter Betrag zuerst',
  'amount-asc': 'Kleinster Betrag zuerst',
}

/** Kategorie-Filter „ohne Kategorie“. */
export const OHNE_KATEGORIE = 'none'

export interface TransaktionsFilter {
  type?: Typ
  art?: Art
  account?: string
  /** Kategorie-ID oder `none`. */
  category?: string
  /** YYYY-MM-DD */
  from?: string
  to?: string
  q?: string
  /** Betrag (Betrag der Buchung, ohne Vorzeichen) von/bis, in der Währung der Buchung. */
  min?: number
  max?: number
  sort: Sortierung
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function istEchtesDatum(s: string): boolean {
  if (!ISO_DATUM.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function zahl(roh: string | undefined): number | undefined {
  if (roh === undefined || roh.trim() === '') return undefined
  const n = Number(roh.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : undefined
}

export type RohFilter = Partial<Record<
  'type' | 'art' | 'account' | 'account_id' | 'category' | 'from' | 'to' | 'q' | 'min' | 'max' | 'sort',
  string | undefined
>>

/**
 * Liest und prüft die Parameter. `account_id` (alter Name aus dem Export-Link des Konto-Details) gilt
 * als `account`. Eine umgekehrte Spanne (`from` nach `to`) wird getauscht statt leer zu laufen.
 */
export function parseFilter(roh: RohFilter): TransaktionsFilter {
  const f: TransaktionsFilter = { sort: 'date-desc' }

  if (roh.type && (TYPEN as readonly string[]).includes(roh.type)) f.type = roh.type as Typ
  if (roh.art && (ARTEN as readonly string[]).includes(roh.art)) f.art = roh.art as Art

  const konto = roh.account ?? roh.account_id
  if (konto && UUID.test(konto)) f.account = konto.toLowerCase()

  if (roh.category === OHNE_KATEGORIE) f.category = OHNE_KATEGORIE
  else if (roh.category && UUID.test(roh.category)) f.category = roh.category.toLowerCase()

  if (roh.from && istEchtesDatum(roh.from)) f.from = roh.from
  if (roh.to && istEchtesDatum(roh.to)) f.to = roh.to
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from]

  const q = roh.q?.trim().slice(0, 120)
  if (q) f.q = q

  f.min = zahl(roh.min)
  f.max = zahl(roh.max)
  if (f.min === undefined) delete f.min
  if (f.max === undefined) delete f.max
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) [f.min, f.max] = [f.max, f.min]

  if (roh.sort && (SORTIERUNGEN as readonly string[]).includes(roh.sort)) f.sort = roh.sort as Sortierung

  return f
}

/** Ist irgendein INHALTLICHER Filter gesetzt? Die Sortierung zählt nicht. */
export function filterAktiv(f: TransaktionsFilter): boolean {
  return Boolean(f.type || f.art || f.account || f.category || f.from || f.to || f.q || f.min !== undefined || f.max !== undefined)
}

/** Parameter für Links (Export, Seitenwechsel): nur gesetzte Werte, Sortierung nur wenn nicht Standard. */
export function filterAlsParameter(f: TransaktionsFilter): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.type) p.type = f.type
  if (f.art) p.art = f.art
  if (f.account) p.account = f.account
  if (f.category) p.category = f.category
  if (f.from) p.from = f.from
  if (f.to) p.to = f.to
  if (f.q) p.q = f.q
  if (f.min !== undefined) p.min = String(f.min)
  if (f.max !== undefined) p.max = String(f.max)
  if (f.sort !== 'date-desc') p.sort = f.sort
  return p
}

// ─── Zeitraum-Voreinstellungen ────────────────────────────────────────────────

export const ZEITRAUM_PRESETS = ['monat', 'letzter-monat', '3m', '6m', 'jahr', '12m'] as const
export type ZeitraumPreset = (typeof ZEITRAUM_PRESETS)[number]

export const ZEITRAUM_LABEL: Record<ZeitraumPreset, string> = {
  monat: 'Dieser Monat',
  'letzter-monat': 'Letzter Monat',
  '3m': '3 Monate',
  '6m': '6 Monate',
  jahr: 'Dieses Jahr',
  '12m': '12 Monate',
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (j: number, m: number, t: number) => `${j}-${pad(m)}-${pad(t)}`
const letzterTag = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate()

/** Monat um `delta` verschieben, Tag aufs Monatsende gekappt (31.05. − 3 Monate = 28.02., nicht 03.03.). */
function monatVerschieben(heute: string, delta: number): string {
  const [j, m, t] = heute.split('-').map(Number)
  const neu = new Date(Date.UTC(j, m - 1 + delta, 1))
  const nj = neu.getUTCFullYear()
  const nm = neu.getUTCMonth() + 1
  return iso(nj, nm, Math.min(t, letzterTag(nj, nm)))
}

/**
 * Von/bis (YYYY-MM-DD) einer Voreinstellung, bezogen auf `heute` (Berliner Datum, vom Aufrufer). `to` ist
 * bei laufenden Zeiträumen `null` (offen bis heute) — so bleibt der Link auch morgen noch „bis jetzt“.
 */
export function zeitraumPreset(key: ZeitraumPreset, heute: string): { from: string; to: string | null } {
  const [j, m] = heute.split('-').map(Number)
  switch (key) {
    case 'monat':
      return { from: iso(j, m, 1), to: null }
    case 'letzter-monat': {
      const vm = m === 1 ? 12 : m - 1
      const vj = m === 1 ? j - 1 : j
      return { from: iso(vj, vm, 1), to: iso(vj, vm, letzterTag(vj, vm)) }
    }
    case '3m':
      return { from: monatVerschieben(heute, -3), to: null }
    case '6m':
      return { from: monatVerschieben(heute, -6), to: null }
    case 'jahr':
      return { from: iso(j, 1, 1), to: null }
    case '12m':
      return { from: monatVerschieben(heute, -12), to: null }
  }
}

/** Welche Voreinstellung entspricht genau diesem Von/Bis? `null`, wenn keine (eigener Zeitraum). */
export function aktivesPreset(from: string | undefined, to: string | undefined, heute: string): ZeitraumPreset | null {
  if (!from) return null
  for (const key of ZEITRAUM_PRESETS) {
    const p = zeitraumPreset(key, heute)
    if (p.from === from && (p.to ?? undefined) === (to ?? undefined)) return key
  }
  return null
}
