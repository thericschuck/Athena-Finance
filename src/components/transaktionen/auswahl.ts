/**
 * Reine Logik der Sammelaktionen und der Betragsanzeige der Transaktionen-Liste. Ohne Imports,
 * damit sie sich mit node:test prüfen lässt.
 */

export type Quelle = 'manual' | 'bank_sync'

export interface AuswahlZeile {
  id: string
  source: Quelle
}

/** Auswahl: Zeilen-ID -> Quelle. Die Quelle gehört dazu, weil Bank- und manuelle Buchungen in verschiedenen Tabellen liegen. */
export type AuswahlMap = ReadonlyMap<string, Quelle>

export function auswahlZusammenfassung(auswahl: AuswahlMap): { anzahl: number; manuell: number; bank: number } {
  let manuell = 0
  for (const q of auswahl.values()) if (q === 'manual') manuell++
  return { anzahl: auswahl.size, manuell, bank: auswahl.size - manuell }
}

export function auswahlAlsZeilen(auswahl: AuswahlMap): AuswahlZeile[] {
  return [...auswahl].map(([id, source]) => ({ id, source }))
}

/** IDs der manuell gebuchten Zeilen (nur diese lassen sich löschen). */
export function manuelleIds(auswahl: AuswahlMap): string[] {
  return [...auswahl].filter(([, q]) => q === 'manual').map(([id]) => id)
}

/** Sind alle Zeilen der Seite ausgewählt? Leere Seite zählt nicht. */
export function alleGewaehlt(auswahl: AuswahlMap, zeilen: readonly { id: string }[]): boolean {
  return zeilen.length > 0 && zeilen.every(z => auswahl.has(z.id))
}

/** Alle Zeilen der Seite an- bzw. abwählen (bestehende Auswahl bleibt erhalten, sonst nichts anderes). */
export function seiteUmschalten(auswahl: AuswahlMap, zeilen: readonly AuswahlZeile[]): Map<string, Quelle> {
  const neu = new Map(auswahl)
  if (alleGewaehlt(auswahl, zeilen)) for (const z of zeilen) neu.delete(z.id)
  else for (const z of zeilen) neu.set(z.id, z.source)
  return neu
}

/** Ergebnistext der Sammelaktion, z. B. „3 Buchungen geändert“. */
export function ergebnisText(n: number, verb: 'geändert' | 'gelöscht'): string {
  return `${n} ${n === 1 ? 'Buchung' : 'Buchungen'} ${verb}`
}

export type BetragTon = 'neutral' | 'plus' | 'minus' | 'normal'

/** Farbton des Betrags: Umbuchungen neutral, sonst nach Richtung (Einnahme grün, Ausgabe rot). */
export function betragTon(type: string, signed: number): BetragTon {
  if (type === 'transfer') return 'neutral'
  if (signed > 0) return 'plus'
  if (signed < 0) return 'minus'
  return 'normal'
}

export const TON_KLASSE: Record<BetragTon, string> = {
  neutral: 'text-muted-foreground',
  plus: 'text-success',
  minus: 'text-danger',
  normal: 'text-foreground',
}

/** Herkunft der Kategorie einer Bankbuchung als Text. `null`, wenn keine bekannt ist. */
export function herkunftText(categorySource: string | null | undefined): string | null {
  if (categorySource === 'auto') return 'Regel / Gelerntes'
  if (categorySource === 'ai') return 'KI'
  if (categorySource === 'manual') return 'von dir'
  return null
}

/** Eine Zahl mit Vorzeichen (echtes Minus) für Tagessummen; 0 gibt es nicht als Vorzeichenzahl. */
export function vorzeichenText(n: number): string {
  return n > 0 ? '+' : n < 0 ? '−' : ''
}
