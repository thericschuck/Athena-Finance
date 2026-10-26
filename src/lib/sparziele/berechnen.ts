/**
 * Reine Berechnungen der Sparziele-Seite (keine Datenbank, keine '@/'-Importe, damit mit node:test
 * pruefbar). Alle Daten sind Kalendertage `YYYY-MM-DD`; "heute" kommt als Berliner Tag von aussen.
 *
 * Wichtig: Der Status `geschlossen` heisst NICHT "erreicht". Ein geschlossenes Ziel ist erreicht,
 * wenn gespart >= Ziel; sonst ist es beendet (z. B. Reise ist vorbei, das Geld war weniger).
 */

export interface ZielDaten {
  id: string
  description: string
  status: string
  priority: string | null
  target_amount: number
  current_amount: number
  target_date: string | null
  monthly_savings_rate: number | null
  savings_rate_start_date: string | null
}

export type ZielPhase = 'offen' | 'erreicht' | 'beendet'

export type AmpelStufe =
  | 'erreicht'     // gespart >= Ziel
  | 'imPlan'       // bei der Rate rechtzeitig fertig
  | 'knapp'        // hoechstens einen Monat zu spaet
  | 'reichtNicht'  // Rate zu klein fuer das Zieldatum
  | 'ueberfaellig' // Zieldatum vorbei, noch nicht erreicht
  | 'ohneRate'     // Zieldatum, aber keine Sparrate
  | 'ohnePlan'     // weder Zieldatum noch Rate
  | 'laeuft'       // Rate, aber kein Zieldatum

export interface Ampel {
  stufe: AmpelStufe
  /** Monate, die bei der Rate noch noetig sind (null ohne Rate oder bei Rest 0). */
  monateNoetig: number | null
  /** Monate bis zum Zieldatum (ganze Monate, null ohne Zieldatum oder wenn vorbei). */
  monateVerfuegbar: number | null
  /** Voraussichtliches Datum bei der aktuellen Rate (null ohne Rate). */
  erreichtAm: string | null
  /** Rate, die bis zum Zieldatum noetig waere (null ohne Zieldatum / wenn vorbei / Rest 0). */
  noetigeRate: number | null
}

const CENT = 0.005

// ─── Datum ───────────────────────────────────────────────────────────────────

function teile(d: string): { y: number; m: number; t: number } {
  const [y, m, t] = d.split('-').map(Number)
  return { y, m, t }
}

function tageImMonat(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Datum plus n Monate; der Tag wird auf das Monatsende gekappt (31.01. + 1 = 28./29.02.). */
export function addMonateTag(datum: string, n: number): string {
  const { y, m, t } = teile(datum)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  const tag = Math.min(t, tageImMonat(ny, nm))
  return `${ny}-${String(nm).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

/**
 * Volle Monate von `von` bis `bis` (negativ, wenn bis vor von liegt). Ein Monat zaehlt, wenn der
 * Tag erreicht ist; am Monatsende zaehlt der letzte Tag als erreicht (31.01. -> 28.02. = 1 Monat).
 */
export function monateZwischenTage(von: string, bis: string): number {
  const a = teile(von), b = teile(bis)
  let diff = (b.y - a.y) * 12 + (b.m - a.m)
  const tagB = b.t
  const tagA = Math.min(a.t, tageImMonat(b.y, b.m))
  if (tagB < tagA) diff -= 1
  return diff
}

// ─── Fortschritt ─────────────────────────────────────────────────────────────

/** Anteil 0..1 (begrenzt) fuer den Balken. */
export function anteil(gespart: number, ziel: number): number {
  if (!(ziel > 0)) return 0
  return Math.min(1, Math.max(0, gespart / ziel))
}

/** Prozent, abgerundet (99,6 % bleibt 99 %, damit "100 %" nur bei erreichtem Ziel steht). */
export function prozent(gespart: number, ziel: number): number {
  if (!(ziel > 0)) return 0
  if (gespart + CENT >= ziel) return 100
  return Math.min(99, Math.max(0, Math.floor((gespart / ziel) * 100)))
}

export function restbetrag(gespart: number, ziel: number): number {
  return Math.max(0, Math.round((ziel - gespart) * 100) / 100)
}

export function ueberschuss(gespart: number, ziel: number): number {
  return Math.max(0, Math.round((gespart - ziel) * 100) / 100)
}

export function phaseVon(z: Pick<ZielDaten, 'status' | 'target_amount' | 'current_amount'>): ZielPhase {
  if (z.status !== 'geschlossen') return 'offen'
  return z.current_amount + CENT >= z.target_amount ? 'erreicht' : 'beendet'
}

// ─── Plan: Enddatum, noetige Rate, Ampel ─────────────────────────────────────

/** Monate bis alles gespart ist (aufgerundet); null ohne Rate. 0 bei Rest 0. */
export function monateBisZiel(rest: number, rate: number | null): number | null {
  if (rest <= CENT) return 0
  if (rate === null || !(rate > 0)) return null
  return Math.ceil((rest - 1e-9) / rate)
}

/** Datum, an dem das Ziel bei der Rate erreicht ist (heute plus noetige Monate). */
export function erreichtAmDatum(heute: string, rest: number, rate: number | null): string | null {
  const m = monateBisZiel(rest, rate)
  return m === null ? null : addMonateTag(heute, m)
}

/** Rate, die noetig ist, um bis `zieldatum` fertig zu werden; null, wenn Datum vorbei oder Rest 0. */
export function noetigeRateBis(heute: string, rest: number, zieldatum: string | null): number | null {
  if (!zieldatum || rest <= CENT) return null
  const m = monateZwischenTage(heute, zieldatum)
  if (zieldatum <= heute) return null
  // Weniger als ein voller Monat bleibt: eine Rate (eine Zahlung) reicht fuer den Rest.
  const raten = Math.max(1, m)
  return Math.ceil((rest / raten) * 100) / 100
}

export function ampelVon(z: ZielDaten, heute: string): Ampel {
  const rest = restbetrag(z.current_amount, z.target_amount)
  const rate = z.monthly_savings_rate && z.monthly_savings_rate > 0 ? z.monthly_savings_rate : null
  if (rest <= CENT) {
    return { stufe: 'erreicht', monateNoetig: 0, monateVerfuegbar: null, erreichtAm: null, noetigeRate: null }
  }
  const monateNoetig = monateBisZiel(rest, rate)
  const erreichtAm = erreichtAmDatum(heute, rest, rate)
  const vorbei = z.target_date !== null && z.target_date < heute
  const verf = z.target_date && !vorbei ? Math.max(1, monateZwischenTage(heute, z.target_date)) : null
  const noetigeRate = noetigeRateBis(heute, rest, z.target_date)
  const basis = { monateNoetig, monateVerfuegbar: verf, erreichtAm, noetigeRate }

  if (vorbei) return { stufe: 'ueberfaellig', ...basis }
  if (z.target_date === null) return { stufe: rate === null ? 'ohnePlan' : 'laeuft', ...basis }
  if (monateNoetig === null || verf === null) return { stufe: 'ohneRate', ...basis }
  if (monateNoetig <= verf) return { stufe: 'imPlan', ...basis }
  if (monateNoetig <= verf + 1) return { stufe: 'knapp', ...basis }
  return { stufe: 'reichtNicht', ...basis }
}

/**
 * Plan-Stand: wie viel haette seit dem Rate-Startdatum gespart sein sollen (volle Monate x Rate)?
 * Setzt voraus, dass ab dem Startdatum bei 0 begonnen wurde; sonst nur ein Anhaltspunkt.
 * Positiv = voraus. null ohne Rate oder Startdatum.
 */
export function planAbweichung(z: ZielDaten, heute: string): number | null {
  if (!z.monthly_savings_rate || z.monthly_savings_rate <= 0 || !z.savings_rate_start_date) return null
  if (z.savings_rate_start_date > heute) return null
  const monate = Math.max(0, monateZwischenTage(z.savings_rate_start_date, heute))
  const soll = Math.min(monate * z.monthly_savings_rate, z.target_amount)
  return Math.round((z.current_amount - soll) * 100) / 100
}

// ─── Sortierung und Kennzahlen ───────────────────────────────────────────────

const PRIO: Record<string, number> = { hoch: 0, mittel: 1, niedrig: 2 }

/** Offene Ziele: Prioritaet, dann frueheres Zieldatum, dann geringerer Fortschritt. */
export function sortiereOffene<T extends ZielDaten>(ziele: T[]): T[] {
  return [...ziele].sort((a, b) => {
    const pa = PRIO[a.priority ?? ''] ?? 3, pb = PRIO[b.priority ?? ''] ?? 3
    if (pa !== pb) return pa - pb
    const da = a.target_date ?? '9999-12-31', db = b.target_date ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return anteil(a.current_amount, a.target_amount) - anteil(b.current_amount, b.target_amount)
  })
}

export interface Kennzahlen {
  offen: number
  erreicht: number
  beendet: number
  /** Summe der Zielbetraege der offenen Ziele. */
  gesamtziel: number
  /** Davon gespart (je Ziel hoechstens das Ziel). */
  gespart: number
  rest: number
  /** Summe der Sparraten offener Ziele (nur Ziele mit Rate). */
  rateGesamt: number
  /** Offene Ziele, deren Rate fuers Zieldatum nicht reicht (reichtNicht, ueberfaellig). */
  kritisch: number
  /** Offene Ziele, die schon voll sind, aber noch nicht als erreicht markiert. */
  vollOffen: number
  naechstesDatum: { datum: string; name: string } | null
}

export function kennzahlen(ziele: ZielDaten[], heute: string): Kennzahlen {
  const k: Kennzahlen = {
    offen: 0, erreicht: 0, beendet: 0, gesamtziel: 0, gespart: 0, rest: 0, rateGesamt: 0,
    kritisch: 0, vollOffen: 0, naechstesDatum: null,
  }
  for (const z of ziele) {
    const p = phaseVon(z)
    if (p === 'erreicht') { k.erreicht++; continue }
    if (p === 'beendet') { k.beendet++; continue }
    k.offen++
    k.gesamtziel += z.target_amount
    k.gespart += Math.min(Math.max(0, z.current_amount), z.target_amount)
    k.rest += restbetrag(z.current_amount, z.target_amount)
    k.rateGesamt += z.monthly_savings_rate && z.monthly_savings_rate > 0 ? z.monthly_savings_rate : 0
    const a = ampelVon(z, heute)
    if (a.stufe === 'reichtNicht' || a.stufe === 'ueberfaellig') k.kritisch++
    if (a.stufe === 'erreicht') k.vollOffen++
    else if (z.target_date && z.target_date >= heute && (!k.naechstesDatum || z.target_date < k.naechstesDatum.datum)) {
      k.naechstesDatum = { datum: z.target_date, name: z.description }
    }
  }
  k.gesamtziel = Math.round(k.gesamtziel * 100) / 100
  k.gespart = Math.round(k.gespart * 100) / 100
  k.rest = Math.round(k.rest * 100) / 100
  k.rateGesamt = Math.round(k.rateGesamt * 100) / 100
  return k
}

/** "5 Mon." / "2 J. 3 Mon." / "3 J." */
export function dauerText(monate: number): string {
  if (monate <= 0) return '0 Mon.'
  if (monate < 12) return `${monate} Mon.`
  const j = Math.floor(monate / 12), r = monate % 12
  return r === 0 ? `${j} J.` : `${j} J. ${r} Mon.`
}
