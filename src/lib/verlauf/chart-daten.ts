import { addMonate } from './networth.ts'
import { NETWORTH_TOEPFE, type LinienPunkt, type NetWorthPunkt, type ProjektionPunkt, type Zeitraum } from './types.ts'

/**
 * Reine Aufbereitung für den Net-Worth-Chart: Zeitraum filtern, Veränderung rechnen,
 * Töpfe zu Schichten bündeln und alle Linien auf eine gemeinsame Zeitachse legen.
 * Bewusst ohne React/Recharts, damit es sich mit node:test prüfen lässt.
 */

export const MAX_TOEPFE = 5
export const WEITERE = 'weitere'
export const SCHULDEN = 'schulden'

const MONATE: Partial<Record<Zeitraum, number>> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

/** YYYY-MM-DD der unteren Grenze, `null` = keine Grenze (Max). */
export function zeitraumGrenze(zeitraum: Zeitraum, heute: Date): string | null {
  if (zeitraum === 'max') return null
  if (zeitraum === 'ytd') return `${heute.getUTCFullYear()}-01-01`
  const monate = MONATE[zeitraum]
  if (monate === undefined) return null
  // `addMonate` kappt aufs Monatsende: `setUTCMonth` machte aus 31.05. minus 3 Monate den
  // 03.03. statt den 28.02. und verkuerzte den Zeitraum um bis zu drei Tage.
  return addMonate(heute.toISOString().split('T')[0], -monate)
}

/**
 * Schneidet auf den Zeitraum zu. Der letzte Punkt VOR der Grenze bleibt erhalten: sonst finge
 * die Kurve mitten in der Luft an, und die Veränderung würde ab dem ersten Punkt NACH der
 * Grenze gerechnet statt ab dem Stand zu Beginn des Zeitraums.
 */
export function filterZeitraum<T extends { datum: string }>(punkte: T[], zeitraum: Zeitraum, heute: Date): T[] {
  const grenze = zeitraumGrenze(zeitraum, heute)
  if (grenze === null) return punkte
  const ab = punkte.findLastIndex(p => p.datum <= grenze)
  return punkte.slice(Math.max(0, ab))
}

export interface Aenderung {
  delta: number
  /** `null`, wenn der Startwert <= 0 ist (Prozent wären dann nicht aussagekräftig). */
  prozent: number | null
}

export function aenderung(start: number, ende: number): Aenderung {
  const delta = ende - start
  return { delta, prozent: start > 0 ? (delta / start) * 100 : null }
}

export interface Schicht {
  key: string
  label: string
}

/**
 * Töpfe für die gestapelte Ansicht: nur solche mit Wert > 0 irgendwo im Verlauf, nach ihrem
 * heutigen Wert absteigend (größte unten); mehr als `MAX_TOEPFE` werden zu „Weitere".
 * Gerechnet wird über ALLE Punkte, nicht nur den gewählten Zeitraum — so behalten die
 * Töpfe beim Umschalten dieselbe Farbe.
 */
export function toepfeSchichten(punkte: NetWorthPunkt[]): { schichten: Schicht[]; rest: Set<string> } {
  const heute = punkte[punkte.length - 1]
  const belegt = NETWORTH_TOEPFE.filter(t => punkte.some(p => p[t.key] > 0))
  const sortiert = [...belegt].sort((a, b) => (heute?.[b.key] ?? 0) - (heute?.[a.key] ?? 0))
  const oben = sortiert.slice(0, MAX_TOEPFE)
  const rest = sortiert.slice(MAX_TOEPFE)
  const schichten: Schicht[] = oben.map(t => ({ key: t.key, label: t.label }))
  if (rest.length > 0) schichten.push({ key: WEITERE, label: 'Weitere' })
  return { schichten, rest: new Set<string>(rest.map(t => t.key)) }
}

export interface ChartZeile {
  /** Zeitstempel (UTC-Mitternacht) für die Zeitachse. */
  t: number
  datum: string
  net_worth?: number
  /** Negativ, damit die Schicht unter der Nulllinie liegt. */
  [SCHULDEN]?: number
  sammlung?: number
  projektion?: number
  /** Unterer und oberer Rand des Prognosebereichs, für eine Bereichsfläche. */
  projektionBand?: [number, number]
  [schicht: string]: number | string | [number, number] | undefined
}

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

/**
 * Legt Net Worth, Töpfe, Sammlung und Projektion auf eine gemeinsame, sortierte Zeitachse.
 * Linien dürfen andere Stichtage haben als die Snapshots; fehlende Werte bleiben `undefined`
 * (Recharts zeichnet die Linie mit `connectNulls` durch).
 * Die Projektion bekommt am letzten Snapshot den echten Net Worth als Anschlusspunkt,
 * sonst hinge die gestrichelte Linie getrennt in der Luft.
 */
export function baueZeilen(
  punkte: NetWorthPunkt[],
  rest: Set<string>,
  sammlung: LinienPunkt[] = [],
  projektion: ProjektionPunkt[] = [],
): ChartZeile[] {
  if (punkte.length === 0) return []
  const start = punkte[0].datum
  const letzter = punkte[punkte.length - 1]
  const zeilen = new Map<string, ChartZeile>()
  const zeile = (datum: string): ChartZeile => {
    let z = zeilen.get(datum)
    if (!z) { z = { t: tag(datum), datum }; zeilen.set(datum, z) }
    return z
  }

  for (const p of punkte) {
    const z = zeile(p.datum)
    z.net_worth = p.net_worth
    z[SCHULDEN] = p.total_debts > 0 ? -p.total_debts : 0
    for (const t of NETWORTH_TOEPFE) {
      const key = rest.has(t.key) ? WEITERE : t.key
      z[key] = ((z[key] as number | undefined) ?? 0) + p[t.key]
    }
  }
  for (const s of sammlung) if (s.datum >= start) zeile(s.datum).sammlung = s.wert
  for (const s of projektion) {
    if (s.datum < start) continue
    const z = zeile(s.datum)
    z.projektion = s.wert
    if (s.unten !== undefined && s.oben !== undefined) z.projektionBand = [s.unten, s.oben]
  }
  if (projektion.some(s => s.datum > letzter.datum)) {
    // Anschluss: die Prognose beginnt beim echten Stand, der Bereich bei Breite 0.
    const z = zeile(letzter.datum)
    z.projektion ??= letzter.net_worth
    z.projektionBand ??= [letzter.net_worth, letzter.net_worth]
  }

  return [...zeilen.values()].sort((a, b) => a.t - b.t)
}
