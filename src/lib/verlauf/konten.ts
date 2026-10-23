/**
 * Reine Rechenlogik fuer den Konten-Tab der Verlauf-Seite: Query-Parameter lesen,
 * Zeitraum-Grenze, Sampling und Veraenderung. Kein Datenbankzugriff — testbar mit node:test.
 */

export type KontoPunkt = { datum: string; saldo: number }

export const ZEITRAEUME = [
  { key: '3m',  label: '3 Mon.', monate: 3 },
  { key: '6m',  label: '6 Mon.', monate: 6 },
  { key: '1y',  label: '1 Jahr', monate: 12 },
  { key: 'max', label: 'Alles',  monate: null },
] as const

export type Zeitraum = typeof ZEITRAEUME[number]['key']

export const STANDARD_ZEITRAUM: Zeitraum = '1y'

/** Unbekannte oder fehlende Werte fallen auf den Standard zurueck (URL ist Nutzereingabe). */
export function parseZeitraum(raw: string | undefined): Zeitraum {
  return ZEITRAEUME.find(z => z.key === raw)?.key ?? STANDARD_ZEITRAUM
}

/**
 * Konto-Filter: `alle` oder eine Konto-ID, die dem Nutzer wirklich gehoert. Eine fremde oder
 * veraltete ID wird wie `alle` behandelt, statt eine leere Seite zu zeigen.
 */
export function parseKonto(raw: string | undefined, kontoIds: readonly string[]): string {
  return raw && kontoIds.includes(raw) ? raw : 'alle'
}

/**
 * Fruehester Kalendertag (ISO, UTC) des Zeitraums oder `null` bei „Alles". Die Monatsrechnung
 * wird auf den Monatsletzten geklammert: 31. Mai minus 3 Monate waere sonst der „31. Februar"
 * und liefe in den Maerz.
 */
export function zeitraumStart(zeitraum: Zeitraum, heute: Date): string | null {
  const z = ZEITRAEUME.find(x => x.key === zeitraum)
  if (!z || z.monate === null) return null
  const tag = heute.getUTCDate()
  const d = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - z.monate, 1))
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(tag, letzter))
  return d.toISOString().split('T')[0]
}

/**
 * Reduziert eine nach Datum aufsteigende Reihe auf hoechstens `max` Punkte, gleichmaessig
 * ueber den Index verteilt. Erster und letzter Punkt bleiben immer erhalten: der erste legt
 * die Veraenderung fest, der letzte ist der aktuelle Saldo und darf nie „gerundet" werden.
 */
export function sampleReihe<T>(reihe: readonly T[], max: number): T[] {
  if (max < 2 || reihe.length <= max) return [...reihe]
  const out: T[] = []
  let letzterIndex = -1
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (reihe.length - 1)) / (max - 1))
    if (idx !== letzterIndex) out.push(reihe[idx])
    letzterIndex = idx
  }
  return out
}

export type Veraenderung = { abs: number; prozent: number | null }

/**
 * Veraenderung zwischen erstem und letztem Punkt. Prozent nur, wenn der Startsaldo > 0 ist —
 * bei Start 0 oder negativem Saldo (Kreditkarte, Dispo) ist eine Prozentzahl irrefuehrend.
 */
export function veraenderung(reihe: readonly KontoPunkt[]): Veraenderung | null {
  if (reihe.length < 2) return null
  const start = reihe[0].saldo
  const ende = reihe[reihe.length - 1].saldo
  const abs = ende - start
  return { abs, prozent: start > 0 ? (abs / start) * 100 : null }
}

/**
 * SVG-Pfad fuer eine Sparkline in einer Box `breite` x `hoehe`. Y wird auf Min/Max der Reihe
 * gestreckt (mit `rand` Luft oben/unten); eine flache Reihe liegt mittig. Leer bei < 2 Punkten.
 */
export function sparklinePfad(werte: readonly number[], breite: number, hoehe: number, rand = 2): string {
  if (werte.length < 2) return ''
  let min = Infinity
  let max = -Infinity
  for (const v of werte) { if (v < min) min = v; if (v > max) max = v }
  const spanne = max - min
  const nutz = hoehe - rand * 2
  return werte
    .map((v, i) => {
      const x = (i / (werte.length - 1)) * breite
      const y = spanne === 0 ? hoehe / 2 : rand + nutz - ((v - min) / spanne) * nutz
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
