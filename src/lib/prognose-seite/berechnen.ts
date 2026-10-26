/**
 * Reine Berechnungen der Prognose-Seite (keine Datenbank, keine Imports): Kennzahlen aus der
 * Prognosereihe der Engine und die Gruppierung der Annahmen. Die Engine selbst (lib/forecast) rechnet
 * die Kurve; hier wird sie nur gelesen und zusammengefasst.
 */

export type PrognoseTagKurz = {
  datum: string
  liquiditaet: number
  liquiditaetUnten: number
  vermoegen: number
}

export type KennzahlenEingabe = {
  /** Heute, `YYYY-MM-DD`. */
  heute: string
  start: { liquiditaet: number; vermoegen: number }
  /** Tageswerte der Prognose ab morgen, aufsteigend. */
  tage: PrognoseTagKurz[]
  tiefpunkt: { betrag: number; datum: string }
  risikoTiefpunkt: { betrag: number; datum: string }
}

export type PrognoseKennzahlen = {
  stand: number
  tiefpunkt: { betrag: number; datum: string }
  /** Letzter Prognosetag; null, wenn es keine Prognosetage gibt. */
  ende: { datum: string; liquiditaet: number; vermoegen: number } | null
  /** Ø Veränderung des Nettovermögens je Monat über den ganzen Zeitraum (inkl. Termine und Annahmen). */
  vermoegenProMonat: number | null
  /** Ø Veränderung der Liquidität je Monat über den ganzen Zeitraum. */
  liquiditaetProMonat: number | null
  /** Erster Tag mit erwarteter Liquidität unter 0; null = nie. */
  erstesMinus: string | null
  /** Erster Tag, an dem die untere Bereichsgrenze (1 von 10 Verläufen) unter 0 fällt; null = nie. */
  erstesRisikoMinus: string | null
}

const TAGE_PRO_MONAT = 30.4375

function tageZwischenIso(von: string, bis: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((t(bis) - t(von)) / 86_400_000)
}

const runde = (n: number) => Math.round(n * 100) / 100

export function prognoseKennzahlen(e: KennzahlenEingabe): PrognoseKennzahlen {
  const letzter = e.tage.length > 0 ? e.tage[e.tage.length - 1] : null
  const monate = letzter ? tageZwischenIso(e.heute, letzter.datum) / TAGE_PRO_MONAT : 0
  const erstes = (f: (t: PrognoseTagKurz) => number) => e.tage.find(t => f(t) < 0)?.datum ?? null
  return {
    stand: e.start.liquiditaet,
    tiefpunkt: e.tiefpunkt,
    ende: letzter ? { datum: letzter.datum, liquiditaet: letzter.liquiditaet, vermoegen: letzter.vermoegen } : null,
    vermoegenProMonat: letzter && monate > 0 ? runde((letzter.vermoegen - e.start.vermoegen) / monate) : null,
    liquiditaetProMonat: letzter && monate > 0 ? runde((letzter.liquiditaet - e.start.liquiditaet) / monate) : null,
    // Liegt die Liquidität schon heute im Minus, gibt es keinen „ersten" Minustag in der Zukunft.
    erstesMinus: e.start.liquiditaet < 0 ? null : erstes(t => t.liquiditaet),
    erstesRisikoMinus: e.start.liquiditaet < 0 ? null : erstes(t => t.liquiditaetUnten),
  }
}

// ── Annahmen ────────────────────────────────────────────────────────────────────────────

export type AnnahmeKurz = {
  id: string
  art: 'lohn' | 'betriebseinnahme' | 'betriebsausgabe' | 'einnahme' | 'ausgabe'
  /** `YYYY-MM` */
  von: string
  /** `YYYY-MM` oder null (unbegrenzt) */
  bis: string | null
}

export type AnnahmeStatus = 'laufend' | 'geplant' | 'beendet' | 'ausserhalb'

/**
 * Wo steht die Annahme im Verhältnis zum Prognosezeitraum (`startMonat` bis `endMonat`, `YYYY-MM`)?
 *   beendet     letzter Monat liegt vor dem laufenden Monat: wirkt nicht mehr
 *   ausserhalb  beginnt erst nach dem gewählten Zeitraum: wirkt in der Kurve (noch) nicht
 *   laufend     gilt im laufenden Monat
 *   geplant     beginnt später innerhalb des Zeitraums
 */
export function annahmeStatus(a: AnnahmeKurz, startMonat: string, endMonat: string): AnnahmeStatus {
  if (a.bis !== null && a.bis < startMonat) return 'beendet'
  if (a.von > endMonat) return 'ausserhalb'
  if (a.von <= startMonat) return 'laufend'
  return 'geplant'
}

export const STATUS_REIHENFOLGE: AnnahmeStatus[] = ['laufend', 'geplant', 'ausserhalb', 'beendet']

export const STATUS_TITEL: Record<AnnahmeStatus, string> = {
  laufend: 'Laufend',
  geplant: 'Geplant',
  ausserhalb: 'Nach dem Zeitraum',
  beendet: 'Beendet',
}

export function gruppiereAnnahmen<T extends AnnahmeKurz>(
  annahmen: T[], startMonat: string, endMonat: string,
): { status: AnnahmeStatus; titel: string; eintraege: T[] }[] {
  const nach = new Map<AnnahmeStatus, T[]>()
  for (const a of annahmen) {
    const s = annahmeStatus(a, startMonat, endMonat)
    nach.set(s, [...(nach.get(s) ?? []), a])
  }
  return STATUS_REIHENFOLGE.filter(s => nach.has(s)).map(s => ({
    status: s,
    titel: STATUS_TITEL[s],
    eintraege: [...nach.get(s)!].sort((x, y) => x.von.localeCompare(y.von) || x.id.localeCompare(y.id)),
  }))
}

/** Einnahmeartig (grün, +) oder Ausgabe (rot, −)? */
export function istEinnahmeArt(art: AnnahmeKurz['art']): boolean {
  return art === 'lohn' || art === 'betriebseinnahme' || art === 'einnahme'
}

// ── Einmalposten: Auswahl zusammenführen ────────────────────────────────────────────────

export type UeberschreibungKurz = { aus: string[]; ein: string[] }

/**
 * Führt die neue Auswahl des Formulars mit der gespeicherten zusammen. Das Formular kennt nur die
 * höchstens 25 größten Kandidaten (`sichtbar`); Entscheidungen zu Posten, die nicht (mehr) in der
 * Liste stehen, bleiben erhalten, statt beim Speichern stillschweigend verloren zu gehen.
 * `erlaubt` = Ids, die dem Nutzer gehören (Besitzprüfung der Action).
 */
export function mischeUeberschreibung(
  bisher: UeberschreibungKurz,
  sichtbar: string[],
  neu: UeberschreibungKurz,
  erlaubt: ReadonlySet<string>,
): UeberschreibungKurz {
  const sicht = new Set(sichtbar)
  const behalte = (liste: string[]) => liste.filter(id => !sicht.has(id))
  const nimm = (liste: string[]) => liste.filter(id => sicht.has(id) && erlaubt.has(id))
  const einmalig = (l: string[]) => [...new Set(l)]
  return {
    aus: einmalig([...behalte(bisher.aus), ...nimm(neu.aus)]),
    ein: einmalig([...behalte(bisher.ein), ...nimm(neu.ein)]),
  }
}
