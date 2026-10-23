import { tageImMonat } from './kennzahlen.ts'
import type { Buchung } from './kennzahlen.ts'

/**
 * Tempo des laufenden Monats gegen die Vormonate und die Hochrechnung zum Monatsende. Rein, ohne
 * React und Datenbank (tempo.test.ts).
 *
 * Idee: Ausgaben (und Einnahmen) fallen nicht gleichmaessig an. Miete und Abos kommen am Monatsanfang,
 * der Lohn an einem festen Tag. Eine lineare Hochrechnung („bisher / Tage x Monatslaenge") liegt
 * deshalb meist daneben. Stattdessen schauen wir, wie sich die abgeschlossenen Vormonate verhalten
 * haben, und uebertragen das auf den aktuellen Stand.
 *
 * Eingabe sind Einzelbuchungen mit denselben Regeln wie der Rest der Seite (Konten und Schalter
 * Anlage/Forderung bereits angewendet, Umbuchungen fehlen).
 */

export type TempoArt = 'ausgaben' | 'einnahmen'

const artTyp = (art: TempoArt) => (art === 'ausgaben' ? 'expense' : 'income')

/** So viele abgeschlossene Vormonate hoechstens, und so viele mindestens, damit eine Aussage taugt. */
export const MAX_VORMONATE = 6
export const MIN_VORMONATE = 3

export interface TempoPunkt {
  /** Tag im Monat, 1-basiert. */
  tag: number
  /** Kumuliert bis zu diesem Tag; null nach heute. */
  aktuell: number | null
  /** Mittel der Vormonate, kumuliert bis zu diesem Tag. */
  schnitt: number
  min: number
  max: number
}

export interface TempoReihe {
  art: TempoArt
  /** Ein Punkt je Tag des laufenden Monats. */
  punkte: TempoPunkt[]
  /** Tag im Monat, der heute ist. */
  heuteTag: number
  /** Die Vormonate (`YYYY-MM`, aelteste zuerst), die in Schnitt und Band eingehen. */
  vormonate: string[]
  aktuellHeute: number
  schnittHeute: number
  /** aktuellHeute − schnittHeute: positiv = mehr als ueblich. */
  abweichung: number
}

export interface Hochrechnung {
  art: TempoArt
  /** Bisher (bis heute) gebucht. */
  stand: number
  /** Erwarteter Wert zum Monatsende. */
  mitte: number
  /** Untere/obere Grenze des typischen Bereichs (25./75. Perzentil); null bei linearer Schaetzung. */
  unten: number | null
  oben: number | null
  /** `verlauf` = aus den Vormonaten; `linear` = zu wenig Historie, grobe Schaetzung nach Tagen. */
  methode: 'verlauf' | 'linear'
  /** Zahl der Vormonate, auf denen die Schaetzung beruht (0 bei linear). */
  monate: number
}

/** Monatserster `n` Monate vor/nach `ym` (`YYYY-MM`), als `YYYY-MM`. */
export function monatVersatz(ym: string, n: number): string {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * Welche abgeschlossenen Vormonate zaehlen? Bis zu `max` Monate vor dem laufenden, aber nur
 * solche mit Buchungen — und nie der allererste Monat der Historie: dort setzt die Bankanbindung
 * oder der Import meist mitten im Monat ein, und ein halber Monat drueckt den Schnitt.
 * `fruehesterMonat` ist der erste Monat mit Daten (YYYY-MM[-DD]); null = unbekannt.
 */
export function waehleVormonate(
  buchungen: readonly Buchung[], heute: string, fruehesterMonat: string | null, max = MAX_VORMONATE,
): string[] {
  const dieser = heute.slice(0, 7)
  const mitDaten = new Set<string>()
  for (const b of buchungen) mitDaten.add(b.date.slice(0, 7))
  const erster = fruehesterMonat ? fruehesterMonat.slice(0, 7) : null
  const out: string[] = []
  for (let i = 1; i <= max; i++) {
    const m = monatVersatz(dieser, -i)
    if (erster !== null && m <= erster) continue
    if (mitDaten.has(m)) out.push(m)
  }
  return out.reverse()
}

/**
 * Kumulierte Summe je Tag eines Monats: Index 0 = bis zum 1., Index L−1 = ganzer Monat. Mit
 * `bisTag` zaehlen nur Buchungen bis zu diesem Tag (laufender Monat: nichts aus der Zukunft).
 */
export function kumuliert(buchungen: readonly Buchung[], monat: string, art: TempoArt, bisTag?: number): number[] {
  const laenge = tageImMonat(monat)
  const proTag = new Array<number>(laenge).fill(0)
  const typ = artTyp(art)
  for (const b of buchungen) {
    if (b.type !== typ || b.date.slice(0, 7) !== monat) continue
    const tag = Number(b.date.slice(8, 10))
    if (!(tag >= 1 && tag <= laenge) || (bisTag !== undefined && tag > bisTag)) continue
    proTag[tag - 1] += b.amount
  }
  let summe = 0
  return proTag.map(v => (summe += v))
}

/** Stand eines Vormonats an Tag `tag`; ist der Monat kuerzer, gilt sein Endstand. */
const stand = (kum: readonly number[], tag: number) => kum[Math.min(tag, kum.length) - 1]

const mittel = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** Perzentil mit linearer Interpolation; `p` in 0..1, `xs` nicht leer. */
export function perzentil(xs: readonly number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * p
  const u = Math.floor(pos)
  const o = Math.ceil(pos)
  return s[u] + (s[o] - s[u]) * (pos - u)
}

export interface TempoOptionen {
  fruehesterMonat?: string | null
  max?: number
  min?: number
}

/** Verlauf des laufenden Monats gegen Schnitt und Spanne der Vormonate; null bei zu wenig Historie. */
export function tempoReihe(
  buchungen: readonly Buchung[], heute: string, art: TempoArt, opt: TempoOptionen = {},
): TempoReihe | null {
  const vormonate = waehleVormonate(buchungen, heute, opt.fruehesterMonat ?? null, opt.max ?? MAX_VORMONATE)
  if (vormonate.length < (opt.min ?? MIN_VORMONATE)) return null

  const dieser = heute.slice(0, 7)
  const heuteTag = Number(heute.slice(8, 10))
  const laenge = tageImMonat(dieser)
  const jetzt = kumuliert(buchungen, dieser, art, heuteTag)
  const historie = vormonate.map(m => kumuliert(buchungen, m, art))

  const punkte: TempoPunkt[] = []
  for (let tag = 1; tag <= laenge; tag++) {
    const werte = historie.map(k => stand(k, tag))
    punkte.push({
      tag,
      aktuell: tag <= heuteTag ? jetzt[tag - 1] : null,
      schnitt: mittel(werte),
      min: Math.min(...werte),
      max: Math.max(...werte),
    })
  }
  const heutePunkt = punkte[Math.min(heuteTag, laenge) - 1]
  const aktuellHeute = heutePunkt.aktuell ?? 0
  return {
    art, punkte, heuteTag, vormonate,
    aktuellHeute,
    schnittHeute: heutePunkt.schnitt,
    abweichung: aktuellHeute - heutePunkt.schnitt,
  }
}

/**
 * Erwartetes Monatsende: heutiger Stand plus das, was in den Vormonaten NACH dem gleichen Tag noch
 * dazukam. Jeder Vormonat liefert so eine eigene Schaetzung; Mitte ist deren Median (ein
 * Ausreisser-Monat mit einer grossen Einmalzahlung zieht ihn nicht weg), die Spanne das 25. bis
 * 75. Perzentil. Additiv statt als Anteil gerechnet, weil Fixkosten (Miete am 1.) sonst
 * mithochskaliert wuerden. Bei zu wenig Historie: linear nach Tagen, ohne Spanne.
 */
export function hochrechnung(
  buchungen: readonly Buchung[], heute: string, art: TempoArt, opt: TempoOptionen = {},
): Hochrechnung {
  const dieser = heute.slice(0, 7)
  const heuteTag = Number(heute.slice(8, 10))
  const laenge = tageImMonat(dieser)
  const jetzt = kumuliert(buchungen, dieser, art, heuteTag)
  const bisher = jetzt[Math.min(heuteTag, laenge) - 1]

  const vormonate = waehleVormonate(buchungen, heute, opt.fruehesterMonat ?? null, opt.max ?? MAX_VORMONATE)
  if (vormonate.length < (opt.min ?? MIN_VORMONATE)) {
    return { art, stand: bisher, mitte: (bisher / Math.max(1, heuteTag)) * laenge, unten: null, oben: null, methode: 'linear', monate: 0 }
  }
  const schaetzungen = vormonate.map(m => {
    const k = kumuliert(buchungen, m, art)
    return bisher + (k[k.length - 1] - stand(k, heuteTag))
  })
  return {
    art, stand: bisher,
    mitte: perzentil(schaetzungen, 0.5),
    unten: perzentil(schaetzungen, 0.25),
    oben: perzentil(schaetzungen, 0.75),
    methode: 'verlauf',
    monate: vormonate.length,
  }
}
