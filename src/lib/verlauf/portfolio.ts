/**
 * Rechenlogik des Portfolio-Tabs (analyse/verlauf). Rein und ohne Supabase, damit sie sich
 * mit node:test pruefen laesst. Datenzugriff: src/lib/data/verlauf-portfolio.ts.
 */
import { addMonate } from './networth.ts'

export interface SnapshotZeile {
  asset_id: string
  /** YYYY-MM-DD */
  snapshot_date: string
  portfolio_name: string | null
  quantity: number
  price_eur: number | null
  value_eur: number | null
}

export const PORTFOLIO_ZEITRAEUME = ['3m', '6m', '1y', 'max'] as const
export type PortfolioZeitraum = typeof PORTFOLIO_ZEITRAEUME[number]

const MONATE: Record<PortfolioZeitraum, number | null> = { '3m': 3, '6m': 6, '1y': 12, max: null }

/** Unbekannte oder fehlende Werte der URL fallen auf „max" zurueck, nie auf einen Fehler. */
export function zeitraumAusParam(p: string | undefined): PortfolioZeitraum {
  return (PORTFOLIO_ZEITRAEUME as readonly string[]).includes(p ?? '') ? (p as PortfolioZeitraum) : 'max'
}

/** Erster Tag (YYYY-MM-DD) des Zeitraums, `null` bei „max". `heute` ist injizierbar fuer Tests. */
export function zeitraumStart(z: PortfolioZeitraum, heute: Date = new Date()): string | null {
  const m = MONATE[z]
  if (m === null) return null
  // Monatsende-sicher (31.05. minus 3 Monate = 28.02., nicht 03.03.).
  return addMonate(heute.toISOString().split('T')[0], -m)
}

/** `asset=a,b` -> Menge. Leer = keine Einschraenkung (alle). */
export function assetsAusParam(p: string | undefined): Set<string> {
  return new Set((typeof p === 'string' ? p : '').split(',').map(s => s.trim()).filter(Boolean))
}

/**
 * Neuer `asset`-Parameter nach Klick auf einen Chip. Sind danach alle gewaehlt, wird der
 * Parameter entfernt (= Standard „alle"), damit URLs sauber bleiben.
 */
export function toggleAsset(aktiv: Set<string>, id: string, alleIds: string[]): string | undefined {
  // Ausgangslage „alle": ein Klick waehlt gezielt dieses eine Asset.
  if (aktiv.size === 0) return id
  const basis = new Set(aktiv)
  if (basis.has(id)) basis.delete(id)
  else basis.add(id)
  if (basis.size === 0 || basis.size === alleIds.length) return undefined
  return alleIds.filter(a => basis.has(a)).join(',')
}

export function filtereZeilen(
  zeilen: SnapshotZeile[],
  opt: { assets?: Set<string>; portfolio?: string; ab?: string | null },
): SnapshotZeile[] {
  return zeilen.filter(z =>
    (!opt.assets || opt.assets.size === 0 || opt.assets.has(z.asset_id)) &&
    (!opt.portfolio || (z.portfolio_name ?? '') === opt.portfolio) &&
    (!opt.ab || z.snapshot_date >= opt.ab),
  )
}

export interface Tagespunkt {
  datum: string
  /** Wert in EUR je Asset-ID. */
  werte: Record<string, number>
}

/**
 * Wert je Tag und Asset. Mehrere Portfolios am selben Tag werden addiert. Fehlt ein Asset an
 * einem Tag zwischen seinem ersten und letzten Snapshot (z. B. ausgefallener Cron-Lauf), wird
 * der letzte bekannte Wert fortgeschrieben — sonst bekaeme die gestapelte Flaeche Loecher, die
 * wie Verkaeufe aussehen. Nach dem letzten Snapshot eines Assets wird NICHT fortgeschrieben:
 * dort ist es plausibel verkauft bzw. nicht mehr verfolgt.
 */
export function aggregiereTage(zeilen: SnapshotZeile[]): Tagespunkt[] {
  const proTag = new Map<string, Map<string, number>>()
  const spanne = new Map<string, { erst: string; letzt: string }>()
  for (const z of zeilen) {
    const wert = z.value_eur ?? 0
    const tag = proTag.get(z.snapshot_date) ?? new Map<string, number>()
    tag.set(z.asset_id, (tag.get(z.asset_id) ?? 0) + wert)
    proTag.set(z.snapshot_date, tag)
    const s = spanne.get(z.asset_id)
    if (!s) spanne.set(z.asset_id, { erst: z.snapshot_date, letzt: z.snapshot_date })
    else {
      if (z.snapshot_date < s.erst) s.erst = z.snapshot_date
      if (z.snapshot_date > s.letzt) s.letzt = z.snapshot_date
    }
  }
  const tage = [...proTag.keys()].sort()
  const zuletzt = new Map<string, number>()
  return tage.map(datum => {
    const tag = proTag.get(datum)!
    const werte: Record<string, number> = {}
    for (const [id, s] of spanne) {
      if (datum < s.erst || datum > s.letzt) continue
      const w = tag.get(id)
      if (w !== undefined) zuletzt.set(id, w)
      werte[id] = w ?? zuletzt.get(id) ?? 0
    }
    return { datum, werte }
  })
}

export function summe(werte: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(werte)) s += v
  return s
}

/** Anteil je Asset in Prozent (Summe 100). Bei Gesamtwert 0 alles 0, nie NaN. */
export function anteile(werte: Record<string, number>): Record<string, number> {
  const s = summe(werte)
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(werte)) out[k] = s > 0 ? (v / s) * 100 : 0
  return out
}

export interface Reihe {
  key: string
  label: string
}

export const WEITERE_KEY = 'weitere'

/**
 * Teilt Assets in sichtbare Schichten (nach heutigem Wert, groesste zuerst) und „Weitere".
 * Mehr als `max` Assets ergeben `max` Schichten plus „Weitere" = sechs Themefarben.
 */
export function bildeReihen(
  tage: Tagespunkt[],
  name: (id: string) => string,
  max = 5,
): { reihen: Reihe[]; rest: Set<string> } {
  const letzte = tage[tage.length - 1]?.werte ?? {}
  const ids = new Set<string>()
  for (const t of tage) for (const id of Object.keys(t.werte)) ids.add(id)
  const sortiert = [...ids].sort((a, b) => (letzte[b] ?? 0) - (letzte[a] ?? 0) || a.localeCompare(b))
  const oben = sortiert.slice(0, max)
  const rest = sortiert.slice(max)
  const reihen: Reihe[] = oben.map(id => ({ key: id, label: name(id) }))
  if (rest.length > 0) reihen.push({ key: WEITERE_KEY, label: 'Weitere' })
  return { reihen, rest: new Set(rest) }
}

/** Fasst die Werte der Rest-Assets zu „Weitere" zusammen. */
export function gruppiere(werte: Record<string, number>, rest: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(werte)) {
    const k = rest.has(id) ? WEITERE_KEY : id
    out[k] = (out[k] ?? 0) + v
  }
  return out
}

export interface AssetKennzahl {
  assetId: string
  /** Wert am letzten Tag des Zeitraums. */
  wert: number
  /** Anteil am Gesamtwert (der gefilterten Assets) am letzten Tag, in %. */
  anteil: number
  /** Gesamtveraenderung des Werts im Zeitraum (inkl. Zukaeufe). */
  deltaGesamtEur: number
  /** Davon Kursgewinn: Menge am Start x Kursaenderung. */
  kursEur: number
  /** Davon Mengeneffekt: Mengenaenderung x Endkurs (Zukauf/Verkauf, kein Gewinn). */
  mengeEur: number
  /** Kursperformance in %: Preis_ende / Preis_start - 1. `null` ohne zwei Kurse. */
  kursProzent: number | null
  mengeStart: number
  mengeEnde: number
}

/**
 * Kennzahlen je Asset, bereinigt um Mengenaenderungen.
 *
 * Entscheidung: Der Wert eines Assets aendert sich durch zwei verschiedene Dinge — der Kurs
 * bewegt sich, oder die Menge aendert sich (Kauf/Verkauf/Staking-Zufluss). Nur das erste ist
 * Performance. Wuerde man einfach Wert_ende - Wert_start zeigen, sähe jeder Zukauf wie ein
 * Gewinn aus. Daher die exakte Zerlegung
 *   Wert1 - Wert0 = q0·(p1 - p0)  [Kurs]  +  (q1 - q0)·p1  [Menge]
 * Die Prozentzahl ist rein die Kursrendite p1/p0 - 1, unabhaengig von der Menge. Die Summe
 * aus Kurs- und Mengenanteil ergibt immer exakt das Wertdelta, nichts geht verloren.
 * Start = erster, Ende = letzter Snapshot des Assets im uebergebenen Zeilenbereich; ein
 * Asset, das erst spaeter beginnt, wird ab seinem ersten Snapshot gemessen (Start-Menge 0
 * gaebe sonst einen reinen Mengeneffekt und keine Kursrendite).
 */
export function assetKennzahlen(zeilen: SnapshotZeile[]): AssetKennzahl[] {
  // Je Asset und Tag zusammenfassen (mehrere Portfolios): Menge und Wert addieren, Preis = Wert/Menge.
  const proAsset = new Map<string, Map<string, { q: number; w: number; p: number | null }>>()
  for (const z of zeilen) {
    const tage = proAsset.get(z.asset_id) ?? new Map()
    const t = tage.get(z.snapshot_date) ?? { q: 0, w: 0, p: null }
    t.q += z.quantity
    t.w += z.value_eur ?? 0
    t.p = z.price_eur ?? t.p
    tage.set(z.snapshot_date, t)
    proAsset.set(z.asset_id, tage)
  }

  const roh = [...proAsset.entries()].map(([assetId, tage]) => {
    const daten = [...tage.keys()].sort()
    const a = tage.get(daten[0])!
    const e = tage.get(daten[daten.length - 1])!
    return { assetId, a, e, last: daten[daten.length - 1] }
  })
  // Nur Assets, die am letzten Tag noch im Bestand sind: ein frueher verschwundenes Asset
  // (verkauft/nicht mehr verfolgt) wuerde sonst mit altem Wert in Summe und Anteilen stehen.
  const letzterTag = zeilen.reduce((m, z) => (z.snapshot_date > m ? z.snapshot_date : m), '')
  const aktuell = roh.filter(r => r.last === letzterTag)
  const gesamt = aktuell.reduce((s, r) => s + r.e.w, 0)

  return aktuell
    .map(({ assetId, a, e }) => {
      const p0 = a.p, p1 = e.p
      const kursEur = p0 !== null && p1 !== null ? a.q * (p1 - p0) : 0
      const delta = e.w - a.w
      return {
        assetId,
        wert: e.w,
        anteil: gesamt > 0 ? (e.w / gesamt) * 100 : 0,
        deltaGesamtEur: delta,
        kursEur,
        // Rest statt eigener Formel: garantiert Summe = Delta, auch bei fehlenden Kursen.
        mengeEur: delta - kursEur,
        kursProzent: p0 !== null && p1 !== null && p0 > 0 ? (p1 / p0 - 1) * 100 : null,
        mengeStart: a.q,
        mengeEnde: e.q,
      }
    })
    .sort((x, y) => y.wert - x.wert)
}
