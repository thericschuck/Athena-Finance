/**
 * Wertmodell für Gegenstände im Inventar — eine begründete Schätzung, keine Messung.
 *
 * Der Wertverlauf eines Stücks bestand bisher aus dem, was man von Hand eintrug: Kaufpreis
 * und ein, zwei Schätzungen. Dazwischen war nichts, und ein Gegenstand, den man täglich
 * trägt, sah genauso aus wie einer im Safe. Das Modell füllt die Lücke zwischen der letzten
 * HANDEINGABE und heute — mit einer Kurve, die vom Gegenstand und seiner Nutzung abhängt.
 *
 * Form der Kurve: Wertverlust ist nicht linear. Der größte Teil fällt direkt nach dem Kauf
 * an (Neuware → gebraucht), danach flacht es ab. Deshalb eine Rate, die mit dem Alter von
 * `r0` auf `rInf` abklingt, statt einer festen Rate pro Jahr:
 *
 *     Rate(Alter) = rInf + (r0 − rInf) · e^(−Alter / tau)
 *     Wert(t)     = Anker · e^(−∫ Rate dt)        (mit Boden, nie über dem Anker)
 *
 * Nutzung: Ein Teil des Verlusts (`verschleiss`) entsteht durch Gebrauch, der Rest durch
 * Zeit und Markt. Wer ein Stück nie benutzt, verliert nur den Zeit-Anteil — nicht null, weil
 * auch ein unbenutztes Stück altert (Modellwechsel, Mode, Kurswert), aber deutlich weniger.
 *
 * Die Parameter sind grobe Erfahrungswerte aus Wiederverkaufsdaten (Stand Okt. 2026), keine
 * Garantie: Uhren verlieren nach dem ersten Jahr meist nur noch wenige Prozent jährlich,
 * Smartphones dagegen rund 20–50 % im ersten Jahr. Wo der Markt Sammlerpreise zahlt (Kunst,
 * Münzen, limitierte Uhren), taugt kein Verschleißmodell — dafür gibt es `stabil`.
 */

export const NUTZUNGEN = [
  { key: 'nie',           label: 'Nie benutzt',      faktor: 0 },
  { key: 'selten',        label: 'Selten',           faktor: 0.5 },
  { key: 'regelmaessig',  label: 'Regelmäßig',       faktor: 1 },
  { key: 'taeglich',      label: 'Täglich',          faktor: 1.6 },
] as const

export type Nutzung = typeof NUTZUNGEN[number]['key']

export const WERTMODI = [
  { key: 'nutzung', label: 'Nach Nutzung schätzen' },
  { key: 'stabil',  label: 'Stabil (Sammlerstück)' },
] as const

export type Wertmodus = typeof WERTMODI[number]['key']

export function nutzungLabel(key: string): string {
  return NUTZUNGEN.find(n => n.key === key)?.label ?? 'Regelmäßig'
}

interface Parameter {
  /** Jährliche Rate direkt nach dem Kauf (0,12 = 12 % pro Jahr, anfangs). */
  r0: number
  /** Jährliche Rate im Langzeitbereich. */
  rInf: number
  /** Abklingzeit in Jahren: nach `tau` ist der Unterschied zwischen r0 und rInf auf 37 % geschrumpft. */
  tau: number
  /** Anteil der Rate, der aus dem Gebrauch kommt (0–1). Der Rest ist Zeit und Markt. */
  verschleiss: number
  /** Untergrenze als Anteil des Referenzwerts (Kaufpreis, sonst Anker). */
  boden: number
}

/**
 * Je Kategorie. Schlüssel wie in `KATEGORIEN` (lib/valuables.ts).
 *
 * Begründung der größeren Posten:
 *  - uhr: erstes Jahr rund 10–25 %, danach wenige Prozent; Gebrauch kratzt, aber das
 *    Werk altert kaum. Markenuhren am oberen Ende können steigen → `stabil`.
 *  - technik: stärkster Verlust (Smartphones 20–50 % im ersten Jahr), fast alles Zeit.
 *  - kleidung/leder: Mode und sichtbarer Gebrauch, deshalb hoher Verschleißanteil.
 *  - schmuck/muenze/kunst: Materialwert bzw. Markt — kaum Verschleiß.
 */
const PARAMETER: Record<string, Parameter> = {
  uhr:           { r0: 0.14, rInf: 0.03, tau: 1.5, verschleiss: 0.35, boden: 0.45 },
  feuerzeug:     { r0: 0.12, rInf: 0.04, tau: 2,   verschleiss: 0.55, boden: 0.45 },
  schmuck:       { r0: 0.04, rInf: 0.01, tau: 2,   verschleiss: 0.30, boden: 0.80 },
  schreibgeraet: { r0: 0.10, rInf: 0.03, tau: 2,   verschleiss: 0.50, boden: 0.50 },
  brille:        { r0: 0.25, rInf: 0.12, tau: 1.5, verschleiss: 0.60, boden: 0.15 },
  leder:         { r0: 0.18, rInf: 0.06, tau: 2,   verschleiss: 0.60, boden: 0.30 },
  kleidung:      { r0: 0.30, rInf: 0.11, tau: 1.2, verschleiss: 0.60, boden: 0.20 },
  kunst:         { r0: 0.00, rInf: 0.00, tau: 1,   verschleiss: 0,    boden: 1 },
  muenze:        { r0: 0.00, rInf: 0.00, tau: 1,   verschleiss: 0,    boden: 1 },
  technik:       { r0: 0.35, rInf: 0.16, tau: 1,   verschleiss: 0.25, boden: 0.08 },
  instrument:    { r0: 0.08, rInf: 0.03, tau: 2,   verschleiss: 0.50, boden: 0.45 },
  sammlung:      { r0: 0.02, rInf: 0.01, tau: 2,   verschleiss: 0.30, boden: 0.70 },
  sonstiges:     { r0: 0.12, rInf: 0.05, tau: 2,   verschleiss: 0.50, boden: 0.30 },
}

const TAGE_PRO_JAHR = 365.25
const MS_PRO_TAG = 86_400_000

function jahre(von: Date, bis: Date): number {
  return Math.max(0, (bis.getTime() - von.getTime()) / MS_PRO_TAG / TAGE_PRO_JAHR)
}

function nutzungsFaktor(nutzung: string): number {
  return NUTZUNGEN.find(n => n.key === nutzung)?.faktor ?? 1
}

export interface ModellEingabe {
  kategorie: string
  nutzung: string
  /** Wertstand der letzten Handeingabe. */
  ankerWert: number
  /** Datum der letzten Handeingabe (YYYY-MM-DD). */
  ankerDatum: string
  /** Kaufdatum — bestimmt, wie weit der steile Teil der Kurve schon hinter dem Stück liegt. */
  gekauftAm: string | null
  kaufpreis: number | null
}

/** Faktor (0–1], um den der Anker zwischen zwei Daten sinkt. */
export function wertfaktor(e: ModellEingabe, bis: Date): number {
  const p = PARAMETER[e.kategorie] ?? PARAMETER.sonstiges
  const anker = new Date(`${e.ankerDatum}T12:00:00`)
  // Ohne Kaufdatum gilt das Stück als so alt wie der Anker — der steile Teil liegt dann noch
  // vor ihm, was bei unbekanntem Alter die vorsichtigere Annahme ist.
  const kauf = e.gekauftAm ? new Date(`${e.gekauftAm}T12:00:00`) : anker
  const a0 = Math.min(jahre(kauf, anker), jahre(kauf, bis))
  const a1 = jahre(kauf, bis)
  if (a1 <= a0) return 1

  // Gebrauch skaliert nur den Verschleiß-Anteil; Zeit und Markt laufen immer.
  const skala = (1 - p.verschleiss) + p.verschleiss * nutzungsFaktor(e.nutzung)
  const integral =
    p.rInf * (a1 - a0) +
    (p.r0 - p.rInf) * p.tau * (Math.exp(-a0 / p.tau) - Math.exp(-a1 / p.tau))
  return Math.exp(-integral * skala)
}

export interface Modellpunkt {
  datum: string
  wert: number
}

const iso = (d: Date) => d.toISOString().split('T')[0]
const rund = (n: number) => Math.round(n * 100) / 100

/**
 * Wöchentliche Punkte vom Tag nach dem Anker bis `heute` (der letzte Punkt ist immer heute).
 * Punkte, die sich vom Vorgänger nicht unterscheiden, entfallen — ein „nie benutztes" Stück
 * mit gleichbleibendem Wert bekommt keine Reihe identischer Zeilen.
 */
export function modellpunkte(e: ModellEingabe, heute: Date = new Date()): Modellpunkt[] {
  const p = PARAMETER[e.kategorie] ?? PARAMETER.sonstiges
  const anker = new Date(`${e.ankerDatum}T12:00:00`)
  const ende = new Date(`${iso(heute)}T12:00:00`)
  if (ende <= anker) return []

  const referenz = Math.max(e.kaufpreis ?? 0, 0) || e.ankerWert
  const boden = Math.min(e.ankerWert, referenz * p.boden)

  const tage: Date[] = []
  for (let d = new Date(anker.getTime() + 7 * MS_PRO_TAG); d < ende; d = new Date(d.getTime() + 7 * MS_PRO_TAG)) {
    tage.push(d)
  }
  tage.push(ende)

  const punkte: Modellpunkt[] = []
  let letzter = e.ankerWert
  for (const [i, d] of tage.entries()) {
    const wert = rund(Math.min(e.ankerWert, Math.max(boden, e.ankerWert * wertfaktor(e, d))))
    const istLetzter = i === tage.length - 1
    if (wert !== letzter || istLetzter) {
      punkte.push({ datum: iso(d), wert })
      letzter = wert
    }
  }
  return punkte
}
