/**
 * Trefferquote der KI-Kategorisierung, abgeleitet aus dem, was in `bank_transactions` ohnehin steht.
 *
 * Jede Buchung, zu der die KI etwas gesagt hat, trägt `ai_category_id`. Was daraus geworden ist, sagt der Rest:
 *   category_source = 'ai'      die KI hat die Kategorie gesetzt, du hast sie nicht angefasst   -> ungeprüft
 *   category_source = 'manual'  du hast entschieden:  gleich dem KI-Wert -> bestätigt, sonst -> korrigiert
 *   category_id leer            nur ein Vorschlag, noch nicht entschieden                      -> offener Vorschlag
 *
 * Die Quote zählt nur, was du entschieden hast (bestätigt / (bestätigt + korrigiert)). Ungeprüfte KI-Zuordnungen
 * zählen NICHT als Treffer: dass du sie nicht korrigiert hast, heißt nicht, dass du sie gesehen hast.
 *
 * Rein bis auf den Lader; keine Imports außer Typen.
 */

export type KiZeile = { category_id: string | null; category_source: string | null; ai_category_id: string | null }

export type KiBilanz = {
  bestaetigt: number
  korrigiert: number
  ungeprueft: number
  offeneVorschlaege: number
  /** Anteil bestätigt an allen entschiedenen (0–100), oder null, wenn noch nichts entschieden ist. */
  quote: number | null
  /** Wie viele Entscheidungen der Quote zugrunde liegen. */
  stichprobe: number
}

export function berechneKiBilanz(zeilen: KiZeile[]): KiBilanz {
  let bestaetigt = 0, korrigiert = 0, ungeprueft = 0, offeneVorschlaege = 0
  for (const z of zeilen) {
    if (!z.ai_category_id) continue
    if (!z.category_id) { offeneVorschlaege++; continue }
    if (z.category_source === 'ai') { ungeprueft++; continue }
    if (z.category_source === 'manual') {
      if (z.category_id === z.ai_category_id) bestaetigt++
      else korrigiert++
    }
  }
  const stichprobe = bestaetigt + korrigiert
  return {
    bestaetigt, korrigiert, ungeprueft, offeneVorschlaege, stichprobe,
    quote: stichprobe > 0 ? Math.round((100 * bestaetigt) / stichprobe) : null,
  }
}
